/** @jest-environment jsdom */
import React, { useRef } from 'react'
import ReactDOM from 'react-dom'
import { act } from 'react-dom/test-utils'
import { useGalleryScrollbarGesture } from './useGalleryScrollbarGesture'

let root: HTMLDivElement
let area: HTMLDivElement
const identity = {}
let timerSpy: jest.SpyInstance
let clearSpy: jest.SpyInstance
function Harness({ enabled = true }: { enabled?: boolean }) {
  const ref = useRef<HTMLDivElement>(null)
  const gesture = useGalleryScrollbarGesture(ref, enabled, identity)
  return <div ref={ref} data-dragging={gesture.dragging} data-hud={gesture.hudVisible}
    onScroll={(event) => gesture.onScroll(event.currentTarget.scrollTop)} />
}
function scroll(top: number) {
  area.scrollTop = top
  act(() => { area.dispatchEvent(new Event('scroll', { bubbles: false })) })
}
beforeEach(() => {
  jest.useFakeTimers()
  timerSpy = jest.spyOn(window, 'setTimeout')
  clearSpy = jest.spyOn(window, 'clearTimeout')
  window.requestAnimationFrame = (callback) => window.setTimeout(() => callback(0), 16)
  window.cancelAnimationFrame = (id) => window.clearTimeout(id)
  root = document.createElement('div')
  document.body.appendChild(root)
  act(() => { ReactDOM.render(<Harness />, root) })
  area = root.firstElementChild as HTMLDivElement
  Object.defineProperties(area, { clientHeight: { value: 600 }, scrollHeight: { value: 100000 }, clientWidth: { value: 786 }, offsetWidth: { value: 800 } })
  area.getBoundingClientRect = () => ({ left: 0, right: 800, top: 0, bottom: 600, width: 800, height: 600 } as DOMRect)
})
afterEach(() => {
  act(() => { ReactDOM.unmountComponentAtNode(root) })
  // 只检查本 Hook 的延时任务；React scheduler 的全局任务不属于 HUD 生命周期。
  const hudTimers = timerSpy.mock.calls.map((call, i) => call[1] === 600 ? timerSpy.mock.results[i]?.value : undefined).filter((handle) => handle !== undefined)
  for (const handle of hudTimers) {
    expect(clearSpy.mock.calls.some((call) => call[0] === handle)).toBe(true)
  }
  jest.restoreAllMocks()
  root.remove()
  jest.useRealTimers()
})

test('native scrollbar drag starts immediately, retains HUD for 600ms after release, then clears', () => {
  act(() => { area.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0, clientX: 795 })) })
  expect(area.dataset.dragging).toBe('true')
  scroll(100)
  act(() => { window.dispatchEvent(new MouseEvent('mouseup')) })
  act(() => { jest.advanceTimersByTime(16) })
  expect(area.dataset.dragging).toBe('false')
  expect(area.dataset.hud).toBe('true')
  act(() => { jest.advanceTimersByTime(600) })
  expect(area.dataset.hud).toBe('false')
})

test('big native jump has a pause fallback; wheel and keyboard jumps do not show HUD', () => {
  scroll(10000)
  expect(area.dataset.hud).toBe('true')
  act(() => { jest.advanceTimersByTime(1200) })
  expect(area.dataset.hud).toBe('false')
  act(() => { area.dispatchEvent(new WheelEvent('wheel', { bubbles: true, deltaY: 10000 })) })
  scroll(20000)
  expect(area.dataset.hud).toBe('false')
  act(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'End' })) })
  scroll(99400)
  expect(area.dataset.hud).toBe('false')
})

test('disabled gallery resets the HUD and removes listeners and pending timers', () => {
  scroll(50000)
  act(() => { ReactDOM.render(<Harness enabled={false} />, root) })
  expect(area.dataset.dragging).toBe('false')
  expect(area.dataset.hud).toBe('false')
  scroll(99000)
  expect(area.dataset.hud).toBe('false')
})
