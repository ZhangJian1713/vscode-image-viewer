/** @jest-environment jsdom */
import React, { useRef } from 'react'
import ReactDOM from 'react-dom'
import { act } from 'react-dom/test-utils'
import { galleryGeometry, galleryLogicalScrollTop, galleryScrollHeight } from './galleryLayout'
import { useLogicalGalleryScroll } from './useLogicalGalleryScroll'

const geometry = galleryGeometry(100000, 1200, 1, 'grid', false)
test('compressed scrollbar retains wheel pixel steps and keyboard viewport steps', () => {
  const root = document.createElement('div')
  document.body.appendChild(root)
  function Harness() {
    const ref = useRef<HTMLDivElement>(null)
    const sizing = useRef(geometry)
    useLogicalGalleryScroll(ref, sizing)
    return <div ref={ref} tabIndex={0} />
  }
  act(() => { ReactDOM.render(<Harness />, root) })
  const area = root.firstElementChild as HTMLDivElement
  Object.defineProperty(area, 'clientHeight', { value: 600 })
  const wheel = new WheelEvent('wheel', { deltaY: 100, bubbles: true, cancelable: true })
  area.dispatchEvent(wheel)
  expect(wheel.defaultPrevented).toBe(true)
  expect(galleryLogicalScrollTop(area.scrollTop, geometry.totalHeight, 600)).toBeCloseTo(100, 5)
  area.dispatchEvent(new KeyboardEvent('keydown', { key: 'PageDown', bubbles: true, cancelable: true }))
  expect(galleryLogicalScrollTop(area.scrollTop, geometry.totalHeight, 600)).toBeCloseTo(700, 5)
  area.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true, cancelable: true }))
  expect(area.scrollTop).toBe(galleryScrollHeight(geometry.totalHeight) - 600)
  area.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true, cancelable: true }))
  expect(area.scrollTop).toBe(0)
  act(() => { ReactDOM.unmountComponentAtNode(root) })
  root.remove()
})
