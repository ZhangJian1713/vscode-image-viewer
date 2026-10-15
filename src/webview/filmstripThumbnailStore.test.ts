import { FilmstripThumbnailStore } from './filmstripThumbnailStore'
import { MESSAGE_CMD } from '../constants'

test('bounds requests at six, deduplicates demand and cancels queued offscreen work', () => {
  const pending: Array<(result: unknown) => void> = []
  const transport = jest.fn((_request, reply) => pending.push(reply))
  const store = new FilmstripThumbnailStore(transport)
  const notify = jest.fn()
  store.activate(notify)
  store.setDemand(Array.from({ length: 20 }, (_, index) => String(index)))
  expect(transport).toHaveBeenCalledTimes(6)
  expect(transport.mock.calls[0][0]).toEqual({ cmd: MESSAGE_CMD.GET_FILMSTRIP_THUMBNAIL, data: { id: '0' } })
  store.setDemand(['0', '0', '19', '18'])
  pending[0]({ kind: 'thumb', thumbSrc: 'cache:0' })
  expect(transport.mock.calls[6][0].data.id).toBe('19')
  pending[1]({ kind: 'original' })
  expect(store.snapshot('1')).toMatchObject({ src: null, error: true })
  expect(transport.mock.calls[7][0].data.id).toBe('18')
  store.setDemand([])
  pending.slice(2).forEach((reply) => reply({ kind: 'error' }))
  expect(transport).toHaveBeenCalledTimes(8)
  store.setDemand(['0'])
  expect(store.snapshot('0')).toMatchObject({ src: 'cache:0', error: false })
  expect(transport).toHaveBeenCalledTimes(8)
  store.destroy()
})

test('timeout shows an error and destroy drops late replies and timers', () => {
  jest.useFakeTimers()
  try {
    const pending: Array<(result: unknown) => void> = []
    const store = new FilmstripThumbnailStore((_request, reply) => pending.push(reply))
    const notify = jest.fn()
    store.activate(notify)
    store.setDemand(['a'])
    jest.advanceTimersByTime(30_000)
    expect(store.snapshot('a')).toMatchObject({ src: null, error: true })
    pending[0]({ kind: 'thumb', thumbSrc: 'late' })
    expect(store.snapshot('a')?.src).toBeNull()
    store.setDemand(['b'])
    store.destroy()
    notify.mockClear()
    pending[1]({ kind: 'thumb', thumbSrc: 'unmounted' })
    expect(notify).not.toHaveBeenCalled()
    expect(jest.getTimerCount()).toBe(0)
    store.activate(notify)
    store.setDemand(['a'])
    expect(pending).toHaveLength(3)
    store.destroy()
  } finally { jest.useRealTimers() }
})
