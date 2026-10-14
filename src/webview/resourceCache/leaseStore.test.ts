import { RESOURCE_LEASE_PREFIX, ResourceLeaseStore } from './leaseStore'

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>()

  get length(): number {
    return this.values.size
  }

  clear(): void {
    this.values.clear()
  }

  getItem(key: string): string | null {
    return this.values.get(key) ?? null
  }

  key(index: number): string | null {
    return Array.from(this.values.keys())[index] ?? null
  }

  removeItem(key: string): void {
    this.values.delete(key)
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value)
  }
}

describe('ResourceLeaseStore', () => {
  test('returns the union of live panel leases and prunes expired leases', () => {
    const storage = new MemoryStorage()
    const one = new ResourceLeaseStore(storage, 'one', 'gallery')
    const two = new ResourceLeaseStore(storage, 'two', 'gallery')
    one.write(['one.png', 'shared.png'], 10_000)
    two.write(['two.png', 'shared.png'], 1_000)

    expect(one.readLiveState(12_000, 5_000)).toEqual({
      urls: new Set(['one.png', 'shared.png']),
      count: 1
    })
    expect(storage.getItem(`${RESOURCE_LEASE_PREFIX}two`)).toBeNull()
  })

  test('removes only its own panel lease', () => {
    const storage = new MemoryStorage()
    const one = new ResourceLeaseStore(storage, 'one', 'gallery')
    const two = new ResourceLeaseStore(storage, 'two', 'single-editor')
    one.write(['one.png'], 1)
    two.write(['two.png'], 1)

    one.remove()

    expect(storage.getItem(`${RESOURCE_LEASE_PREFIX}one`)).toBeNull()
    expect(storage.getItem(`${RESOURCE_LEASE_PREFIX}two`)).not.toBeNull()
  })
})
