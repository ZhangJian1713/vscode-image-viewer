import {
  isManagedImageResourceUrl,
  listResourceCacheVersions,
  parseWebviewServiceWorkerContext,
  WebviewServiceWorkerContext,
  responseLooksLikeImage
} from './cacheModel'
import { createPanelId, ResourceLeaseKind, ResourceLeaseStore } from './leaseStore'

/* eslint-disable no-unused-vars -- function type parameter names are documentation */

const MIGRATION_VERSION = '1'
const MIGRATION_MARKER = 'image-viewer.resource-cache-migration-version'
const MIGRATION_LOCK = 'image-viewer-resource-cache-migration'
const GC_LOCK = 'image-viewer-resource-cache-gc'
const FALLBACK_LOCK_PREFIX = 'image-viewer.resource-cache-lock.v1.'
const FALLBACK_LOCK_TTL_MS = 5 * 60_000

const HEARTBEAT_MS = 10_000
const LEASE_TTL_MS = 5 * 60_000
const RELEASE_GRACE_MS = 30_000
const GC_DEBOUNCE_MS = 750
const GC_COMPENSATION_MS = 30_000
const PERIODIC_GC_MS = 60_000
const HARD_HIGH_WATER_BYTES = 2 * 1024 * 1024 * 1024
const INITIAL_MAINTENANCE_DELAY_MS = 1_500
const INITIAL_MAINTENANCE_IDLE_TIMEOUT_MS = 3_500

type LockOptions = {
  mode?: 'exclusive'
  ifAvailable?: boolean
}

type LockManagerLike = {
  request<T>(
    name: string,
    options: LockOptions,
    callback: (lock: unknown | null) => Promise<T>
  ): Promise<T>
}

type NavigatorWithOptionalLocks = Navigator & { locks?: LockManagerLike }
type WindowWithIdleCallback = Window & {
  requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number
  cancelIdleCallback?: (handle: number) => void
}
/* eslint-enable no-unused-vars */

export type ResourceCacheCleanupResult = {
  matchedCaches: number
  deletedCaches: number
  failedCaches: number
}

export type ResourceCacheGcStats = {
  scanned: number
  imageEntries: number
  retained: number
  deleted: number
  failed: number
  deletedOldCaches: number
}

export type ResourceCacheSweepOptions = WebviewServiceWorkerContext

function getCacheStorage(): CacheStorage | null {
  return typeof caches === 'undefined' ? null : caches
}

function getControllerScriptUrl(): string | null {
  try {
    return navigator.serviceWorker?.controller?.scriptURL ?? null
  } catch {
    return null
  }
}

async function resolveWebviewServiceWorkerContext(): Promise<WebviewServiceWorkerContext> {
  const controllerContext = parseWebviewServiceWorkerContext(getControllerScriptUrl())
  if (controllerContext.resourceBaseAuthority) {
    return controllerContext
  }
  try {
    const registration = await navigator.serviceWorker?.getRegistration()
    return parseWebviewServiceWorkerContext(
      registration?.active?.scriptURL ??
        registration?.waiting?.scriptURL ??
        registration?.installing?.scriptURL
    )
  } catch {
    return controllerContext
  }
}

async function withWebLock<T>(
  name: string,
  ifAvailable: boolean,
  callback: () => Promise<T>
): Promise<T | null> {
  const lockManager = (navigator as NavigatorWithOptionalLocks).locks
  if (!lockManager) {
    return withLocalStorageLock(name, ifAvailable, callback)
  }
  return lockManager.request(
    name,
    { mode: 'exclusive', ...(ifAvailable ? { ifAvailable: true } : {}) },
    async (lock) => {
      if (!lock) {
        return null as T | null
      }
      return callback()
    }
  )
}

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds))
}

async function waitForInitialMaintenanceWindow(): Promise<void> {
  // Let React paint and the first visible image start loading before asking Chromium to unlink
  // potentially tens of gigabytes. CacheStorage work is asynchronous, but its disk I/O can still
  // compete with the resource request that the user opened the viewer for.
  await wait(INITIAL_MAINTENANCE_DELAY_MS)
  const idleWindow = window as WindowWithIdleCallback
  if (!idleWindow.requestIdleCallback) {
    return
  }
  await new Promise<void>((resolve) => {
    idleWindow.requestIdleCallback?.(() => resolve(), {
      timeout: INITIAL_MAINTENANCE_IDLE_TIMEOUT_MS
    })
  })
}

async function withLocalStorageLock<T>(
  name: string,
  ifAvailable: boolean,
  callback: () => Promise<T>
): Promise<T | null> {
  const storage = getLocalStorage()
  if (!storage) {
    // Deletion is idempotent; unavailable coordination must not disable cleanup.
    return callback()
  }
  const key = `${FALLBACK_LOCK_PREFIX}${name}`
  const owner = createPanelId()
  let acquired = false

  while (!acquired) {
    const now = Date.now()
    let currentOwner = ''
    let expiresAt = 0
    try {
      const raw = storage.getItem(key)
      if (raw) {
        const parsed = JSON.parse(raw) as { owner?: unknown; expiresAt?: unknown }
        currentOwner = typeof parsed.owner === 'string' ? parsed.owner : ''
        expiresAt = typeof parsed.expiresAt === 'number' ? parsed.expiresAt : 0
      }
      if (!currentOwner || expiresAt <= now) {
        storage.setItem(
          key,
          JSON.stringify({ owner, expiresAt: now + FALLBACK_LOCK_TTL_MS })
        )
        const confirmation = JSON.parse(storage.getItem(key) || '{}') as { owner?: string }
        acquired = confirmation.owner === owner
      }
    } catch {
      return callback()
    }

    if (!acquired) {
      if (ifAvailable) {
        return null
      }
      await wait(Math.min(250, Math.max(25, expiresAt - now)))
    }
  }

  try {
    return await callback()
  } finally {
    try {
      const current = JSON.parse(storage.getItem(key) || '{}') as { owner?: string }
      if (current.owner === owner) {
        storage.removeItem(key)
      }
    } catch {
      // Expiry releases an orphaned fallback lock.
    }
  }
}

export async function deleteAllResourceCaches(
  cacheStorage: CacheStorage
): Promise<ResourceCacheCleanupResult> {
  const versions = listResourceCacheVersions(await cacheStorage.keys())
  const result: ResourceCacheCleanupResult = {
    matchedCaches: versions.length,
    deletedCaches: 0,
    failedCaches: 0
  }
  // Delete cache generations sequentially. Chromium performs the operation off the JS thread,
  // but serializing generations avoids creating avoidable disk-I/O bursts during viewer startup.
  for (const { name } of versions) {
    try {
      if (await cacheStorage.delete(name)) {
        result.deletedCaches += 1
      }
    } catch (error) {
      result.failedCaches += 1
      console.warn(`[Image Viewer] Could not delete CacheStorage cache ${name}.`, error)
    }
  }
  return result
}

export async function sweepResourceCaches(
  cacheStorage: CacheStorage,
  protectedUrls: Set<string>,
  options: ResourceCacheSweepOptions = {
    resourceBaseAuthority: null
  }
): Promise<ResourceCacheGcStats> {
  const versions = listResourceCacheVersions(await cacheStorage.keys())
  const stats: ResourceCacheGcStats = {
    scanned: 0,
    imageEntries: 0,
    retained: 0,
    deleted: 0,
    failed: 0,
    deletedOldCaches: 0
  }
  if (versions.length === 0) {
    return stats
  }

  // Sweep every numeric version. The worker registration query contains an expected version,
  // not a runtime CacheStorage API contract, and host packaging has mismatched the two before.
  // Version-agnostic entry cleanup is safe across upgrades and downgrades; the one-time migration
  // and last-panel cleanup are responsible for deleting whole cache containers.
  for (const version of versions) {
    const cache = await cacheStorage.open(version.name)
    const requests = await cache.keys()
    stats.scanned += requests.length

    const batchSize = 24
    for (let start = 0; start < requests.length; start += batchSize) {
      const batch = requests.slice(start, start + batchSize)
      await Promise.all(
        batch.map(async (request) => {
          if (!isManagedImageResourceUrl(request.url, options.resourceBaseAuthority)) {
            return
          }
          let response: Response | undefined
          try {
            response = await cache.match(request)
          } catch {
            stats.failed += 1
            return
          }
          if (!responseLooksLikeImage(response)) {
            return
          }
          stats.imageEntries += 1
          if (protectedUrls.has(request.url)) {
            stats.retained += 1
            return
          }
          try {
            if (await cache.delete(request)) {
              stats.deleted += 1
            }
          } catch {
            stats.failed += 1
          }
        })
      )
    }
  }
  return stats
}

function getLocalStorage(): Storage | null {
  try {
    return window.localStorage
  } catch {
    return null
  }
}

export class ResourceCacheManager {
  private readonly leaseStore: ResourceLeaseStore | null
  private readonly refCounts = new Map<string, number>()
  private readonly slots = new Map<string, string>()
  private readonly graceUntil = new Map<string, number>()
  private resourceContext = parseWebviewServiceWorkerContext(getControllerScriptUrl())
  private heartbeatTimer: number | null = null
  private periodicGcTimer: number | null = null
  private leaseWriteTimer: number | null = null
  private graceGcTimer: number | null = null
  private compensationTimer: number | null = null
  private gcTimer: number | null = null
  private idleCallbackHandle: number | null = null
  private initialized = false
  private initializationPromise: Promise<ResourceCacheCleanupResult | null> | null = null
  private destroyed = false

  constructor(private readonly kind: ResourceLeaseKind) {
    const storage = getLocalStorage()
    this.leaseStore = storage
      ? new ResourceLeaseStore(storage, createPanelId(), kind)
      : null
  }

  async initialize(forceCleanup: boolean = false): Promise<ResourceCacheCleanupResult | null> {
    if (this.initializationPromise) {
      return this.initializationPromise
    }
    this.startRuntime()
    this.initializationPromise = this.initializeInBackground(forceCleanup)
    return this.initializationPromise
  }

  private startRuntime(): void {
    if (this.initialized || this.destroyed) {
      return
    }
    this.initialized = true
    this.writeLeaseNow()
    this.heartbeatTimer = window.setInterval(() => this.writeLeaseNow(), HEARTBEAT_MS)
    this.periodicGcTimer = window.setInterval(() => this.requestGc(), PERIODIC_GC_MS)
    window.addEventListener('storage', this.handleStorage)
    window.addEventListener('pagehide', this.handlePageHide)
    document.addEventListener('visibilitychange', this.handleVisibilityChange)
  }

  private async initializeInBackground(
    forceCleanup: boolean
  ): Promise<ResourceCacheCleanupResult | null> {
    let cleanupResult: ResourceCacheCleanupResult | null = null
    let migrationError: unknown
    try {
      if (!forceCleanup) {
        await waitForInitialMaintenanceWindow()
        if (this.destroyed) {
          return null
        }
      }
      this.resourceContext = await resolveWebviewServiceWorkerContext()
      cleanupResult = await this.runMigration(forceCleanup)
    } catch (error) {
      // Cache governance must never prevent the viewer from rendering.
      console.warn('[Image Viewer] Resource cache migration failed; it will retry next time.', error)
      migrationError = error
    }
    if (!this.destroyed) {
      this.requestGc()
      this.scheduleCompensationGc()
    }
    if (forceCleanup && migrationError) {
      throw migrationError
    }
    return cleanupResult
  }

  retain(url: string): () => void {
    if (!url || !isManagedImageResourceUrl(url, this.resourceContext.resourceBaseAuthority)) {
      return () => {}
    }
    this.refCounts.set(url, (this.refCounts.get(url) ?? 0) + 1)
    this.graceUntil.delete(url)
    this.queueLeaseWrite()
    let released = false
    return () => {
      if (released) {
        return
      }
      released = true
      const next = (this.refCounts.get(url) ?? 1) - 1
      if (next > 0) {
        this.refCounts.set(url, next)
      } else {
        this.refCounts.delete(url)
        this.beginGraceIfInactive(url)
      }
      this.queueLeaseWrite()
    }
  }

  setSlot(slot: string, url: string | null | undefined): void {
    const previous = this.slots.get(slot)
    const next =
      url && isManagedImageResourceUrl(url, this.resourceContext.resourceBaseAuthority)
        ? url
        : undefined
    if (previous === next) {
      return
    }
    if (previous) {
      this.slots.delete(slot)
      this.beginGraceIfInactive(previous)
    }
    if (next) {
      this.slots.set(slot, next)
      this.graceUntil.delete(next)
    }
    this.queueLeaseWrite()
  }

  async forceClearAll(): Promise<ResourceCacheCleanupResult> {
    const result = await this.clearAllResourceCaches()
    const storage = getLocalStorage()
    if (storage && result.failedCaches === 0) {
      try {
        storage.setItem(MIGRATION_MARKER, MIGRATION_VERSION)
      } catch {
        // Cleanup succeeded even if the optimization marker cannot be persisted.
      }
    }
    this.requestGc()
    return result
  }

  destroy(): void {
    if (this.destroyed) {
      return
    }
    this.destroyed = true
    this.clearTimers()
    window.removeEventListener('storage', this.handleStorage)
    window.removeEventListener('pagehide', this.handlePageHide)
    document.removeEventListener('visibilitychange', this.handleVisibilityChange)
    this.refCounts.clear()
    this.slots.clear()
    this.graceUntil.clear()
    this.leaseStore?.remove()
    void this.runGarbageCollection(true)
  }

  private async runMigration(forceCleanup: boolean): Promise<ResourceCacheCleanupResult | null> {
    const storage = getLocalStorage()
    if (!forceCleanup && storage?.getItem(MIGRATION_MARKER) === MIGRATION_VERSION) {
      return null
    }
    return withWebLock(GC_LOCK, false, () =>
      withWebLock(MIGRATION_LOCK, false, async () => {
        if (!forceCleanup && storage?.getItem(MIGRATION_MARKER) === MIGRATION_VERSION) {
          return null
        }
        const result = await this.clearAllResourceCachesWithoutLock()
        if (result.failedCaches === 0) {
          try {
            storage?.setItem(MIGRATION_MARKER, MIGRATION_VERSION)
          } catch {
            // Retry on the next opening if localStorage is unavailable.
          }
        }
        return result
      })
    )
  }

  private async clearAllResourceCaches(): Promise<ResourceCacheCleanupResult> {
    const result = await withWebLock(GC_LOCK, false, async () =>
      withWebLock(MIGRATION_LOCK, false, () => this.clearAllResourceCachesWithoutLock())
    )
    return result ?? { matchedCaches: 0, deletedCaches: 0, failedCaches: 0 }
  }

  private async clearAllResourceCachesWithoutLock(): Promise<ResourceCacheCleanupResult> {
    const cacheStorage = getCacheStorage()
    if (!cacheStorage) {
      throw new Error('CacheStorage is unavailable in this WebView')
    }
    return deleteAllResourceCaches(cacheStorage)
  }

  private isActive(url: string): boolean {
    if ((this.refCounts.get(url) ?? 0) > 0) {
      return true
    }
    for (const slotUrl of this.slots.values()) {
      if (slotUrl === url) {
        return true
      }
    }
    return false
  }

  private beginGraceIfInactive(url: string): void {
    if (this.isActive(url)) {
      return
    }
    this.graceUntil.set(url, Date.now() + RELEASE_GRACE_MS)
    this.scheduleGraceGc()
  }

  private collectLeaseUrls(now: number): Set<string> {
    const urls = new Set<string>()
    this.refCounts.forEach((_count, url) => urls.add(url))
    this.slots.forEach((url) => urls.add(url))
    this.graceUntil.forEach((expiresAt, url) => {
      if (expiresAt > now) {
        urls.add(url)
      } else {
        this.graceUntil.delete(url)
      }
    })
    return urls
  }

  private queueLeaseWrite(): void {
    if (this.destroyed || this.leaseWriteTimer !== null) {
      return
    }
    this.leaseWriteTimer = window.setTimeout(() => {
      this.leaseWriteTimer = null
      this.writeLeaseNow()
    }, 50)
  }

  private writeLeaseNow(): void {
    if (this.destroyed) {
      return
    }
    const now = Date.now()
    this.leaseStore?.write(this.collectLeaseUrls(now), now)
  }

  private scheduleGraceGc(): void {
    if (this.graceGcTimer !== null) {
      window.clearTimeout(this.graceGcTimer)
    }
    let earliest = Infinity
    this.graceUntil.forEach((expiresAt) => {
      earliest = Math.min(earliest, expiresAt)
    })
    if (!Number.isFinite(earliest)) {
      return
    }
    this.graceGcTimer = window.setTimeout(() => {
      this.graceGcTimer = null
      this.writeLeaseNow()
      this.requestGc()
      this.scheduleCompensationGc()
      if (this.graceUntil.size > 0) {
        this.scheduleGraceGc()
      }
    }, Math.max(0, earliest - Date.now() + 50))
  }

  private scheduleCompensationGc(): void {
    if (this.destroyed) {
      return
    }
    if (this.compensationTimer !== null) {
      window.clearTimeout(this.compensationTimer)
    }
    this.compensationTimer = window.setTimeout(() => {
      this.compensationTimer = null
      this.requestGc()
    }, GC_COMPENSATION_MS)
  }

  private requestGc(): void {
    if (this.destroyed || this.gcTimer !== null || this.idleCallbackHandle !== null) {
      return
    }
    this.gcTimer = window.setTimeout(() => {
      this.gcTimer = null
      const idleWindow = window as WindowWithIdleCallback
      if (idleWindow.requestIdleCallback) {
        this.idleCallbackHandle = idleWindow.requestIdleCallback(
          () => {
            this.idleCallbackHandle = null
            void this.runGarbageCollection()
          },
          { timeout: 2_000 }
        )
      } else {
        void this.runGarbageCollection()
      }
    }, GC_DEBOUNCE_MS)
  }

  private async runGarbageCollection(
    clearWhenLastPanel: boolean = false
  ): Promise<ResourceCacheGcStats | null> {
    const cacheStorage = getCacheStorage()
    if (!cacheStorage) {
      return null
    }
    try {
      return await withWebLock(GC_LOCK, true, async () => {
        this.resourceContext = await resolveWebviewServiceWorkerContext()
        const now = Date.now()
        const liveState = this.leaseStore?.readLiveState(now, LEASE_TTL_MS)
        const protectedUrls = liveState?.urls ?? new Set<string>()
        this.collectLeaseUrls(now).forEach((url) => protectedUrls.add(url))
        if (clearWhenLastPanel && liveState && liveState.count === 0) {
          const cleanup = await deleteAllResourceCaches(cacheStorage)
          return {
            scanned: 0,
            imageEntries: 0,
            retained: 0,
            deleted: 0,
            failed: cleanup.failedCaches,
            deletedOldCaches: cleanup.deletedCaches
          }
        }
        const stats = await sweepResourceCaches(
          cacheStorage,
          protectedUrls,
          this.resourceContext
        )
        await this.applyHighWaterBreaker(cacheStorage, protectedUrls)
        return stats
      })
    } catch (error) {
      console.warn('[Image Viewer] Resource cache garbage collection failed.', error)
      return null
    }
  }

  private async applyHighWaterBreaker(
    cacheStorage: CacheStorage,
    protectedUrls: Set<string>
  ): Promise<void> {
    const storageManager = (navigator as Navigator & {
      storage?: { estimate?: () => Promise<{ usage?: number; quota?: number }> }
    }).storage
    const estimate = storageManager?.estimate
    if (!estimate || protectedUrls.size > 0) {
      return
    }
    try {
      const { usage } = await estimate.call(storageManager)
      if (typeof usage === 'number' && usage > HARD_HIGH_WATER_BYTES) {
        await deleteAllResourceCaches(cacheStorage)
      }
    } catch {
      // Estimate is an optional safety net. The normal entry-level sweep already ran.
    }
  }

  private clearTimers(): void {
    const timers = [
      this.heartbeatTimer,
      this.periodicGcTimer,
      this.leaseWriteTimer,
      this.graceGcTimer,
      this.compensationTimer,
      this.gcTimer
    ]
    timers.forEach((timer) => {
      if (timer !== null) {
        window.clearTimeout(timer)
      }
    })
    const idleWindow = window as WindowWithIdleCallback
    if (this.idleCallbackHandle !== null && idleWindow.cancelIdleCallback) {
      idleWindow.cancelIdleCallback(this.idleCallbackHandle)
    }
  }

  private readonly handleStorage = (event: StorageEvent): void => {
    if (event.key?.startsWith('image-viewer.resource-lease.')) {
      this.requestGc()
    }
  }

  private readonly handleVisibilityChange = (): void => {
    if (document.visibilityState === 'visible') {
      this.writeLeaseNow()
      this.requestGc()
    }
  }

  private readonly handlePageHide = (): void => {
    this.refCounts.clear()
    this.slots.clear()
    this.graceUntil.clear()
    this.leaseStore?.remove()
    void this.runGarbageCollection(true)
  }
}
