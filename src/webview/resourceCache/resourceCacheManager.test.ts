import {
  deleteAllResourceCaches,
  sweepResourceCaches
} from './resourceCacheManager'

const resourceUrl = (name: string): string =>
  `https://file+.vscode-resource.vscode-cdn.net/workspace/${name}`

const fakeResponse = (contentType: string): Response =>
  ({ headers: { get: () => contentType } } as unknown) as Response

function requestUrl(request: RequestInfo): string {
  return typeof request === 'string' ? request : request.url
}

class FakeCache {
  readonly entries = new Map<string, Response>()

  add(url: string, contentType: string): this {
    this.entries.set(url, fakeResponse(contentType))
    return this
  }

  async keys(): Promise<ReadonlyArray<Request>> {
    return Array.from(this.entries.keys()).map((url) => ({ url } as Request))
  }

  async match(request: RequestInfo): Promise<Response | undefined> {
    return this.entries.get(requestUrl(request))
  }

  async delete(request: RequestInfo): Promise<boolean> {
    return this.entries.delete(requestUrl(request))
  }
}

class FakeCacheStorage {
  readonly values = new Map<string, FakeCache>()

  add(name: string, cache: FakeCache = new FakeCache()): FakeCache {
    this.values.set(name, cache)
    return cache
  }

  async keys(): Promise<string[]> {
    return Array.from(this.values.keys())
  }

  async delete(name: string): Promise<boolean> {
    return this.values.delete(name)
  }

  async open(name: string): Promise<Cache> {
    if (!this.values.has(name)) {
      this.values.set(name, new FakeCache())
    }
    return (this.values.get(name) as unknown) as Cache
  }
}

class TrackingDeleteCacheStorage extends FakeCacheStorage {
  readonly deleteOrder: string[] = []
  maxConcurrentDeletes = 0
  private concurrentDeletes = 0

  async delete(name: string): Promise<boolean> {
    this.deleteOrder.push(name)
    this.concurrentDeletes += 1
    this.maxConcurrentDeletes = Math.max(
      this.maxConcurrentDeletes,
      this.concurrentDeletes
    )
    await Promise.resolve()
    const deleted = await super.delete(name)
    this.concurrentDeletes -= 1
    return deleted
  }
}

describe('resource CacheStorage operations', () => {
  test('migration deletes every versioned resource cache and preserves unknown caches', async () => {
    const storage = new TrackingDeleteCacheStorage()
    storage.add('vscode-resource-cache-4')
    storage.add('vscode-resource-cache-6')
    storage.add('extension-owned-unrelated-cache')

    await expect(
      deleteAllResourceCaches((storage as unknown) as CacheStorage)
    ).resolves.toEqual({ matchedCaches: 2, deletedCaches: 2, failedCaches: 0 })
    await expect(storage.keys()).resolves.toEqual(['extension-owned-unrelated-cache'])
    expect(storage.deleteOrder).toEqual([
      'vscode-resource-cache-4',
      'vscode-resource-cache-6'
    ])
    expect(storage.maxConcurrentDeletes).toBe(1)
  })

  test('steady sweep scans every version and only removes unprotected image entries', async () => {
    const storage = new FakeCacheStorage()
    storage.add('vscode-resource-cache-4').add(resourceUrl('old.png'), 'image/png')
    const current = storage.add('vscode-resource-cache-6')
    const active = resourceUrl('active.png')
    const stale = resourceUrl('stale.JPG')
    const script = resourceUrl('app.js')
    const misleading = resourceUrl('not-really-image.png')
    current
      .add(active, 'image/png')
      .add(stale, 'image/jpeg')
      .add(script, 'text/javascript')
      .add(misleading, 'text/plain')
    storage.add('unrelated-cache').add(resourceUrl('leave-me.png'), 'image/png')

    await expect(
      sweepResourceCaches((storage as unknown) as CacheStorage, new Set([active]), {
        resourceBaseAuthority: 'vscode-resource.vscode-cdn.net'
      })
    ).resolves.toEqual({
      scanned: 5,
      imageEntries: 3,
      retained: 1,
      deleted: 2,
      failed: 0,
      deletedOldCaches: 0
    })
    expect(Array.from(current.entries.keys())).toEqual([active, script, misleading])
    expect(storage.values.has('vscode-resource-cache-4')).toBe(true)
    expect(storage.values.get('vscode-resource-cache-4')?.entries.size).toBe(0)
    expect(storage.values.has('unrelated-cache')).toBe(true)
  })

  test('does not assume the numerically largest version is current', async () => {
    const storage = new FakeCacheStorage()
    const activeCache = storage.add('vscode-resource-cache-6')
    const active = resourceUrl('active.png')
    const stale = resourceUrl('stale.png')
    activeCache.add(active, 'image/png').add(stale, 'image/png')
    storage.add('vscode-resource-cache-7').add(resourceUrl('future.png'), 'image/png')

    await expect(
      sweepResourceCaches((storage as unknown) as CacheStorage, new Set([active]), {
        resourceBaseAuthority: 'vscode-resource.vscode-cdn.net'
      })
    ).resolves.toEqual({
      scanned: 3,
      imageEntries: 3,
      retained: 1,
      deleted: 2,
      failed: 0,
      deletedOldCaches: 0
    })
    expect(storage.values.has('vscode-resource-cache-7')).toBe(true)
    expect(storage.values.get('vscode-resource-cache-7')?.entries.size).toBe(0)
    expect(Array.from(activeCache.entries.keys())).toEqual([active])
  })

  test('scans but does not delete HTTPS entries when worker metadata is unavailable', async () => {
    const storage = new FakeCacheStorage()
    const old = storage.add('vscode-resource-cache-6')
    const newer = storage.add('vscode-resource-cache-7')
    const script = resourceUrl('app.js')
    old.add(resourceUrl('old.png'), 'image/png').add(script, 'text/javascript')
    newer.add(resourceUrl('new.png'), 'image/png')

    await expect(
      sweepResourceCaches((storage as unknown) as CacheStorage, new Set())
    ).resolves.toEqual({
      scanned: 3,
      imageEntries: 0,
      retained: 0,
      deleted: 0,
      failed: 0,
      deletedOldCaches: 0
    })
    expect(storage.values.has('vscode-resource-cache-6')).toBe(true)
    expect(storage.values.has('vscode-resource-cache-7')).toBe(true)
    expect(Array.from(old.entries.keys())).toEqual([resourceUrl('old.png'), script])
    expect(Array.from(newer.entries.keys())).toEqual([resourceUrl('new.png')])
  })

  test('does not require the worker cache version to exist yet', async () => {
    const storage = new FakeCacheStorage()
    const old = storage.add('vscode-resource-cache-4')
    const newer = storage.add('vscode-resource-cache-6')
    const protectedImage = resourceUrl('protected.png')
    old.add(resourceUrl('old.png'), 'image/png')
    newer.add(protectedImage, 'image/png').add(resourceUrl('stale.png'), 'image/png')

    await expect(
      sweepResourceCaches((storage as unknown) as CacheStorage, new Set([protectedImage]), {
        resourceBaseAuthority: 'vscode-resource.vscode-cdn.net'
      })
    ).resolves.toEqual({
      scanned: 3,
      imageEntries: 3,
      retained: 1,
      deleted: 2,
      failed: 0,
      deletedOldCaches: 0
    })
    expect(storage.values.has('vscode-resource-cache-4')).toBe(true)
    expect(storage.values.has('vscode-resource-cache-6')).toBe(true)
    expect(Array.from(newer.entries.keys())).toEqual([protectedImage])
  })
})
