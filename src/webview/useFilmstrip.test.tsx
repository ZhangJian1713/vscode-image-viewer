/** @jest-environment jsdom */
import React from 'react'
import ReactDOM from 'react-dom'
import { act } from 'react-dom/test-utils'
import { useFilmstrip } from './useFilmstrip'
import { MESSAGE_CMD } from '../constants'

const ids = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']
let root: HTMLDivElement
let strip: ReturnType<typeof useFilmstrip>
function Harness({ transport }: any) { strip = useFilmstrip(transport, ids, 'single', 2); return null }
beforeEach(() => { root = document.createElement('div'); document.body.appendChild(root) })
afterEach(() => { act(() => { ReactDOM.unmountComponentAtNode(root) }); root.remove() })

test('saved visibility requests only mounted thumbnails, prioritizes current, and hiding stops queued work', async () => {
  const pending: Array<(value: unknown) => void> = []
  const transport = jest.fn((message, callback) => {
    if (message.cmd === MESSAGE_CMD.GET_FILMSTRIP_STATE) { callback({ ok: true, visible: true }) }
    else if (message.cmd === MESSAGE_CMD.GET_FILMSTRIP_THUMBNAIL) { pending.push(callback) }
    else { callback({ ok: true }) }
  })
  act(() => { ReactDOM.render(<Harness transport={transport} />, root) })
  expect(strip.visible).toBe(true)
  expect(pending).toHaveLength(0)
  act(() => { strip.onVisibleIndexesChange(ids.map((_id, index) => index)) })
  expect(pending).toHaveLength(6)
  const calls = transport.mock.calls.filter(([message]) => message.cmd === MESSAGE_CMD.GET_FILMSTRIP_THUMBNAIL)
  expect(calls[0][0].data.id).toBe('c')
  await act(async () => { strip.toggle(false) })
  act(() => { pending[0]({ kind: 'thumb', thumbSrc: 'cache:c' }) })
  expect(pending).toHaveLength(6)
  expect(strip.store.snapshot('c')?.src).toBe('cache:c')
})

test('late preference reads cannot overwrite a user toggle and unmount cancels pending saves', async () => {
  jest.useFakeTimers()
  try {
    const schedule = jest.spyOn(global, 'setTimeout')
    const clear = jest.spyOn(global, 'clearTimeout')
    let preference: (value: unknown) => void
    const transport = jest.fn((message, callback) => {
      if (message.cmd === MESSAGE_CMD.GET_FILMSTRIP_STATE) { preference = callback }
    })
    act(() => { ReactDOM.render(<Harness transport={transport} />, root) })
    await act(async () => { strip.toggle(true) })
    act(() => { preference!({ ok: true, visible: false }) })
    expect(strip.visible).toBe(true)
    const timerIndex = schedule.mock.calls.findIndex((call) => call[1] === 5000)
    expect(timerIndex).toBeGreaterThanOrEqual(0)
    const timer = schedule.mock.results[timerIndex].value
    await act(async () => { ReactDOM.unmountComponentAtNode(root) })
    expect(clear).toHaveBeenCalledWith(timer)
    schedule.mockRestore(); clear.mockRestore()
  } finally { jest.useRealTimers() }
})
