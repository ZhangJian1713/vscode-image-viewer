export const RESOURCE_LEASE_PREFIX = 'image-viewer.resource-lease.v1.'

/* eslint-disable no-unused-vars -- TypeScript parameter properties are used at runtime */

export type ResourceLeaseKind = 'gallery' | 'single-editor'

export type LiveResourceLeases = {
  urls: Set<string>
  count: number
}

type StoredResourceLease = {
  updatedAt: number
  urls: string[]
  kind: ResourceLeaseKind
}

function parseLease(value: string | null): StoredResourceLease | null {
  if (!value) {
    return null
  }
  try {
    const parsed = JSON.parse(value) as Partial<StoredResourceLease>
    if (
      typeof parsed.updatedAt !== 'number' ||
      !Array.isArray(parsed.urls) ||
      (parsed.kind !== 'gallery' && parsed.kind !== 'single-editor')
    ) {
      return null
    }
    return {
      updatedAt: parsed.updatedAt,
      urls: parsed.urls.filter((url): url is string => typeof url === 'string'),
      kind: parsed.kind
    }
  } catch {
    return null
  }
}

export function createPanelId(): string {
  const cryptoApi = (typeof crypto !== 'undefined' ? crypto : undefined) as
    | (Crypto & { randomUUID?: () => string })
    | undefined
  if (cryptoApi && typeof cryptoApi.randomUUID === 'function') {
    return cryptoApi.randomUUID()
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
}

export class ResourceLeaseStore {
  private readonly key: string

  constructor(
    private readonly storage: Storage,
    panelId: string,
    private readonly kind: ResourceLeaseKind
  ) {
    this.key = `${RESOURCE_LEASE_PREFIX}${panelId}`
  }

  write(urls: Iterable<string>, now: number = Date.now()): void {
    const value: StoredResourceLease = {
      updatedAt: now,
      urls: Array.from(new Set(urls)),
      kind: this.kind
    }
    try {
      this.storage.setItem(this.key, JSON.stringify(value))
    } catch (error) {
      console.warn('[Image Viewer] Could not update resource cache lease.', error)
    }
  }

  remove(): void {
    try {
      this.storage.removeItem(this.key)
    } catch {
      // Best effort during page teardown.
    }
  }

  readLiveUrls(now: number, ttlMs: number): Set<string> {
    return this.readLiveState(now, ttlMs).urls
  }

  readLiveState(now: number, ttlMs: number): LiveResourceLeases {
    const urls = new Set<string>()
    let count = 0
    const expiredKeys: string[] = []
    try {
      for (let index = 0; index < this.storage.length; index += 1) {
        const key = this.storage.key(index)
        if (!key || !key.startsWith(RESOURCE_LEASE_PREFIX)) {
          continue
        }
        const lease = parseLease(this.storage.getItem(key))
        if (!lease || now - lease.updatedAt > ttlMs) {
          expiredKeys.push(key)
          continue
        }
        count += 1
        lease.urls.forEach((url) => urls.add(url))
      }
      expiredKeys.forEach((key) => this.storage.removeItem(key))
    } catch (error) {
      console.warn('[Image Viewer] Could not read resource cache leases.', error)
    }
    return { urls, count }
  }
}
/* eslint-enable no-unused-vars */
