/** @jest-environment jsdom */
import { act, renderHook } from '@testing-library/react-hooks'
import { usePreviewPreferences } from './usePreviewPreferences'
import { MESSAGE_CMD } from '../constants'

beforeEach(() => jest.useFakeTimers())
afterEach(() => { jest.clearAllTimers(); jest.useRealTimers() })
test('newer broadcasts win over delayed bootstrap replies', () => {
  let reply
  const transport = jest.fn((_request, callback) => { reply = callback })
  const { result, unmount } = renderHook(() => usePreviewPreferences(transport))
  act(() => { window.dispatchEvent(new MessageEvent('message', { data: {
    cmd: MESSAGE_CMD.PREVIEW_PREFERENCES_CHANGED, data: { showMirrorButtons: true, revision: 2 }
  } })) })
  act(() => { reply({ ok: true, snapshot: { showMirrorButtons: false, revision: 0 } }) })
  expect(result.current.showMirrorButtons).toBe(true)
  unmount()
})
test('failed or timed-out saves keep the current preference, unlock retry, and ignore late replies', () => {
  let save
  const transport = jest.fn((request, callback) => {
    if (request.cmd === MESSAGE_CMD.GET_PREVIEW_PREFERENCES) { callback({ ok: true, snapshot: { showMirrorButtons: false, revision: 0 } }) }
    else { save = callback }
  })
  const { result, unmount } = renderHook(() => usePreviewPreferences(transport))
  act(() => result.current.setShowMirrorButtons(true))
  expect(result.current.saving).toBe(true)
  act(() => { save({ ok: false, snapshot: { showMirrorButtons: false, revision: 0 } }) })
  expect(result.current).toMatchObject({ saving: false, saveError: true, showMirrorButtons: false })
  act(() => result.current.setShowMirrorButtons(true))
  const old = save
  act(() => jest.advanceTimersByTime(5000))
  expect(result.current).toMatchObject({ saving: false, saveError: true })
  act(() => old({ ok: true, snapshot: { showMirrorButtons: true, revision: 1 } }))
  expect(result.current.showMirrorButtons).toBe(false)
  act(() => result.current.setShowMirrorButtons(true))
  act(() => { save({ ok: true, snapshot: { showMirrorButtons: true, revision: 2 } }) })
  expect(result.current).toMatchObject({ saving: false, saveError: false, showMirrorButtons: true })
  unmount()
  expect(jest.getTimerCount()).toBe(0)
})

test('replacing the transport cancels the old save and rejects replies from its old lifecycle', () => {
  let oldRead, oldSave, newSave
  const oldTransport = jest.fn((request, callback) => {
    if (request.cmd === MESSAGE_CMD.GET_PREVIEW_PREFERENCES) { oldRead = callback } else { oldSave = callback }
  })
  const newTransport = jest.fn((request, callback) => {
    if (request.cmd === MESSAGE_CMD.GET_PREVIEW_PREFERENCES) {
      callback({ ok: true, snapshot: { showMirrorButtons: false, revision: 1 } })
    } else { newSave = callback }
  })
  const { result, rerender, unmount } = renderHook(({ transport }) => usePreviewPreferences(transport),
    { initialProps: { transport: oldTransport } })
  act(() => result.current.setShowMirrorButtons(true))
  rerender({ transport: newTransport })
  expect(result.current.saving).toBe(false)
  act(() => result.current.setShowMirrorButtons(true))
  expect(newTransport).toHaveBeenCalledWith(expect.objectContaining({ cmd: MESSAGE_CMD.SET_PREVIEW_PREFERENCES }), expect.any(Function))
  act(() => {
    oldRead({ ok: true, snapshot: { showMirrorButtons: true, revision: 100 } })
    oldSave({ ok: true, snapshot: { showMirrorButtons: true, revision: 100 } })
  })
  expect(result.current).toMatchObject({ saving: true, showMirrorButtons: false })
  act(() => newSave({ ok: true, snapshot: { showMirrorButtons: true, revision: 2 } }))
  expect(result.current).toMatchObject({ saving: false, showMirrorButtons: true, revision: 2 })
  unmount()
  expect(jest.getTimerCount()).toBe(0)
})
