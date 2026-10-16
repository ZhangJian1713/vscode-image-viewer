/** @jest-environment jsdom */
import React from 'react'
import ReactDOM from 'react-dom'
import { act } from 'react-dom/test-utils'
import { FullscreenErrorNotice, useHostFullscreen } from './useHostFullscreen'
import { MESSAGE_CMD } from '../constants'

jest.mock('../i18n/react', () => ({ useI18n: () => ({ t: (key) => key }) }))

const transport = jest.fn()
let api: ReturnType<typeof useHostFullscreen>
let root: HTMLDivElement
function Harness() { api = useHostFullscreen(transport); return <FullscreenErrorNotice error={api.error} /> }
beforeEach(() => {
  jest.useFakeTimers(); transport.mockReset()
  root = document.createElement('div'); document.body.appendChild(root)
  act(() => { ReactDOM.render(<Harness />, root) })
})
afterEach(() => {
  act(() => { ReactDOM.unmountComponentAtNode(root) }); root.remove()
  jest.clearAllTimers(); jest.useRealTimers(); jest.restoreAllMocks()
})
const toggle = () => api.fullscreen.toggle!()

test('sends one fixed message and resolves only after the host acknowledges it', async () => {
  const schedule = jest.spyOn(window, 'setTimeout')
  const clear = jest.spyOn(window, 'clearTimeout')
  let reply: (result: unknown) => void
  transport.mockImplementation((_request, callback) => { reply = callback })
  const done = jest.fn()
  const action = toggle() as Promise<void>
  void action.then(done)
  expect(transport).toHaveBeenCalledWith({ cmd: MESSAGE_CMD.TOGGLE_WINDOW_FULLSCREEN }, expect.any(Function))
  expect(done).not.toHaveBeenCalled()
  await act(async () => { reply!({ ok: true }); await action })
  expect(done).toHaveBeenCalledTimes(1)
  const rpcTimer = schedule.mock.calls.findIndex(([, delay]) => delay === 5000)
  expect(rpcTimer).toBeGreaterThanOrEqual(0)
  expect(clear).toHaveBeenCalledWith(schedule.mock.results[rpcTimer].value)
})
test('surfaces failure and clears it on a successful retry', async () => {
  jest.spyOn(console, 'error').mockImplementation(() => {})
  transport.mockImplementation((_request, callback) => callback({ ok: false, error: 'denied' }))
  await act(async () => { try { await toggle() } catch (error) { api.onFullscreenError(error) } })
  expect(root.querySelector('[role="alert"]')).not.toBeNull()
  transport.mockImplementation((_request, callback) => callback({ ok: true }))
  await act(async () => { await toggle() })
  expect(root.querySelector('[role="alert"]')).toBeNull()
})
test('times out a missing host reply and ignores a late duplicate reply', async () => {
  let reply: (result: unknown) => void
  transport.mockImplementation((_request, callback) => { reply = callback })
  const action = toggle() as Promise<void>
  const rejected = expect(action).rejects.toThrow('No fullscreen response')
  act(() => { jest.advanceTimersByTime(5000) })
  await rejected
  act(() => { reply!({ ok: true }) })
  expect(jest.getTimerCount()).toBe(0)
})
test('rejects pending work on unmount without updating the departed preview', async () => {
  const action = toggle() as Promise<void>
  const rejected = expect(action).rejects.toThrow('preview was closed')
  act(() => { ReactDOM.unmountComponentAtNode(root) })
  await rejected
  expect(jest.getTimerCount()).toBe(0)
})

test('a retained toggle callback cannot change the window after its preview unmounts', async () => {
  transport.mockImplementation((_request, callback) => callback({ ok: true }))
  const retained = api.fullscreen.toggle!
  act(() => { ReactDOM.unmountComponentAtNode(root) })
  await expect(retained()).rejects.toThrow('preview was closed')
  expect(transport).not.toHaveBeenCalled()
  expect(jest.getTimerCount()).toBe(0)
})
