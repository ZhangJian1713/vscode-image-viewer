import { GalleryThumbnailStore } from './galleryThumbnailStore'
import { completeGalleryImages } from './galleryModel'

const image = (index: number) =>
  completeGalleryImages([{ path: `/folder/${index}.png`, vscodePath: `resource:${index}`, size: 100 }], '/project')[0]

test('deduplicates matching demand and bounds concurrent requests', () => {
  const pending: Array<(result: unknown) => void> = []
  const transport = jest.fn((_request, callback) => pending.push(callback))
  const store = new GalleryThumbnailStore(transport, 2)
  const release: Array<() => void> = []
  for (let index = 0; index < 10; index++) {
    release.push(store.subscribe(image(index), 200, 1000, false, () => {}))
  }
  release.push(store.subscribe(image(0), 200, 1000, false, () => {}))
  expect(transport).toHaveBeenCalledTimes(2)
  expect(store.stats.running).toBe(2)
  for (let index = 0; index < 10; index++) {
    pending[index]({ kind: 'original' })
  }
  expect(transport).toHaveBeenCalledTimes(10)
  release.forEach((stop) => stop())
  store.destroy()
})

test('discards unmounted queued requests and prioritizes visible demand over overscan', () => {
  const pending: Array<(result: unknown) => void> = []
  const transport = jest.fn((_request, callback) => pending.push(callback))
  const store = new GalleryThumbnailStore(transport, 1)
  store.subscribe(image(0), 200, 1000, false, () => {})
  const cancel = store.subscribe(image(1), 200, 500, false, () => {})
  store.subscribe(image(2), 200, 1000, false, () => {})
  cancel()
  pending[0]({ kind: 'original' })
  expect(transport.mock.calls[1][0].data.filePath).toBe('/project/folder/2.png')
  store.destroy()
})

test('evicts idle URL results and never publishes a late result to an unmounted card', () => {
  const pending: Array<(result: unknown) => void> = []
  const store = new GalleryThumbnailStore((_request, callback) => pending.push(callback), 1, 2)
  for (let index = 0; index < 6; index++) {
    const listener = jest.fn()
    const stop = store.subscribe(image(index), 200, 1000, false, listener)
    stop()
    listener.mockClear()
    pending[index]({ kind: 'original' })
    expect(listener).not.toHaveBeenCalled()
  }
  expect(store.stats.entries).toBeLessThanOrEqual(2)
  store.destroy()
})

test('thumbnail load failure retries once and prevents an endless broken-image loop', () => {
  const pending: Array<(result: unknown) => void> = []
  const listener = jest.fn()
  const store = new GalleryThumbnailStore((_request, callback) => pending.push(callback), 1)
  const item = image(0)
  store.subscribe(item, 200, 1000, false, listener)
  pending[0]({ kind: 'thumb', thumbSrc: 'deleted-cache.jpg' })
  store.retry(item, 200)
  pending[1]({ kind: 'thumb', thumbSrc: 'still-broken.jpg' })
  store.retry(item, 200)
  expect(listener.mock.calls[listener.mock.calls.length - 1][0].status).toBe('error')
  expect(pending).toHaveLength(2)
  store.destroy()
})
