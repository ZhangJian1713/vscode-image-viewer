/** @jest-environment jsdom */
import React from 'react'
import ReactDOM from 'react-dom'
import { act } from 'react-dom/test-utils'
import { useClickZoomGesture } from './useClickZoomGesture'

let root: HTMLDivElement
const cycle = jest.fn()
const panStart = jest.fn()
const panMove = jest.fn()
const panEnd = jest.fn()

function Harness({ mode = 'fit', source = 'a' }: { mode?: 'fit' | 'native'; source?: string }) {
  const gesture = useClickZoomGesture({ enabled: true, resourceKey: source, mode,
    onCycle: cycle, onPanStart: panStart, onPanMove: panMove, onPanEnd: panEnd })
  return <div onClickCapture={gesture.onClickCapture}><div data-media data-dragging={gesture.dragging}
    onPointerDown={gesture.onPointerDown} onPointerMove={gesture.onPointerMove}
    onPointerUp={gesture.onPointerUp} onLostPointerCapture={gesture.onPointerCancel} /></div>
}

function pointer(type: string, x = 100, y = 100, target: EventTarget = root.querySelector('[data-media]')!, extra = {}) {
  const event = new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0, buttons: type === 'pointerup' ? 0 : 1 })
  Object.defineProperties(event, { pointerId: { value: 1 }, pointerType: { value: 'mouse' }, isPrimary: { value: true } })
  Object.entries(extra).forEach(([key, value]) => Object.defineProperty(event, key, { value, configurable: true }))
  act(() => { target.dispatchEvent(event) })
}

beforeEach(() => {
  jest.clearAllMocks()
  root = document.createElement('div')
  document.body.appendChild(root)
})
afterEach(() => {
  act(() => { ReactDOM.unmountComponentAtNode(root) })
  root.remove()
})

test('Fit zooms on press once and subsequent movement in that press never pans', () => {
  act(() => { ReactDOM.render(<Harness />, root) })
  pointer('pointerdown')
  expect(cycle).toHaveBeenCalledWith({ x: 100, y: 100 })
  pointer('pointermove', 150, 150)
  pointer('pointerup', 150, 150)
  expect(cycle).toHaveBeenCalledTimes(1)
  expect(panStart).not.toHaveBeenCalled()
})

test('Native waits for release within 4px, but a drag only pans and does not cycle', () => {
  act(() => { ReactDOM.render(<Harness mode='native' />, root) })
  pointer('pointerdown')
  pointer('pointermove', 102, 102)
  expect(panMove).not.toHaveBeenCalled()
  pointer('pointerup', 102, 102)
  expect(cycle).toHaveBeenCalledTimes(1)
  pointer('pointerdown', 200, 200)
  pointer('pointermove', 210, 210)
  expect(panStart).toHaveBeenCalledTimes(1)
  expect(root.querySelector('[data-media]')?.getAttribute('data-dragging')).toBe('true')
  pointer('pointerup', 210, 210, window)
  expect(panEnd).toHaveBeenCalledTimes(1)
  expect(cycle).toHaveBeenCalledTimes(1)
  expect(root.querySelector('[data-media]')?.getAttribute('data-dragging')).toBe('false')
})

test('a double-click advances once and the synthetic click after zoom is consumed', () => {
  act(() => { ReactDOM.render(<Harness />, root) })
  pointer('pointerdown')
  pointer('pointerup')
  pointer('pointerdown')
  pointer('pointerup')
  expect(cycle).toHaveBeenCalledTimes(1)
  const click = new MouseEvent('click', { bubbles: true, cancelable: true })
  root.querySelector('[data-media]')!.dispatchEvent(click)
  expect(click.defaultPrevented).toBe(true)
})

test('blur and image replacement cancel sessions without zooming on late release', () => {
  act(() => { ReactDOM.render(<Harness mode='native' />, root) })
  pointer('pointerdown')
  pointer('pointermove', 130, 130)
  act(() => { window.dispatchEvent(new Event('blur')) })
  expect(panEnd).toHaveBeenCalledTimes(1)
  pointer('pointerup', 130, 130)
  expect(cycle).not.toHaveBeenCalled()
  pointer('pointerdown', 200, 200)
  act(() => { ReactDOM.render(<Harness mode='native' source='b' />, root) })
  pointer('pointerup', 200, 200)
  expect(cycle).not.toHaveBeenCalled()
})
