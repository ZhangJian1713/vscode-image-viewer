/** @jest-environment jsdom */
import React from 'react'
import ReactDOM from 'react-dom'
import { act } from 'react-dom/test-utils'
import { ImagePreview } from './ImagePreview'
import type { ImagePreviewRef } from './types'
import { resolveStrings } from './locale'

let root: HTMLDivElement
let ref: React.RefObject<ImagePreviewRef>
let rect: DOMRect

beforeEach(() => {
  rect = { x: 0, y: 0, left: 0, top: 0, right: 800, bottom: 600, width: 800, height: 600 } as DOMRect
  window.ResizeObserver = class {
    constructor(private callback: ResizeObserverCallback) {}
    observe(target: Element) { this.callback([{ target, contentRect: rect } as ResizeObserverEntry], this as unknown as ResizeObserver) }
    unobserve() {}
    disconnect() {}
  } as typeof ResizeObserver
  window.requestAnimationFrame = (callback) => window.setTimeout(() => callback(0), 0)
  window.cancelAnimationFrame = (id) => window.clearTimeout(id)
  root = document.createElement('div')
  document.body.appendChild(root)
  ref = React.createRef<ImagePreviewRef>()
})
afterEach(() => {
  act(() => { ReactDOM.unmountComponentAtNode(root) })
  root.remove()
})

async function readyImage(width: number, height: number) {
  act(() => { ReactDOM.render(<ImagePreview ref={ref} src='mock:test' visible progressiveMain={false}
    clickZoomEnabled doubleClickEnabled={false} closeOnMaskClick stops={[10,25,50,75,100,150,200,800]} />, root) })
  const media = root.querySelector('[data-preview-media]') as HTMLDivElement
  media.parentElement!.getBoundingClientRect = () => rect
  media.setPointerCapture = jest.fn()
  media.hasPointerCapture = () => false
  const image = media.querySelector('img')!
  Object.defineProperties(image, { naturalWidth: { value: width }, naturalHeight: { value: height } })
  image.decode = () => Promise.resolve()
  await act(async () => { image.dispatchEvent(new Event('load')); await Promise.resolve() })
  return media
}

function space(target: Element = root.querySelector('[role="dialog"]')!, repeat = false) {
  act(() => { target.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', code: 'Space', bubbles: true, cancelable: true, repeat })) })
}

test('Space uses the three-state adaptive cycle and ignores held repeats', async () => {
  await readyImage(3200, 2400)
  expect(ref.current!.getState().fitEquivalentNativePercent).toBe(25)
  space()
  expect(ref.current!.getState().nativePercent).toBe(50)
  space(undefined, true)
  expect(ref.current!.getState().nativePercent).toBe(50)
  space()
  expect(ref.current!.getState().nativePercent).toBe(100)
  space()
  expect(ref.current!.getState().mode).toBe('fit')
})

test('small image Fit caps at 100%, then Space changes actual pixels to 200%', async () => {
  const media = await readyImage(100, 100)
  expect(ref.current!.getState().fitEquivalentNativePercent).toBe(100)
  expect(media.style.transform).toContain('scale(1)')
  space()
  expect(media.style.transform).toContain('scale(2)')
  space()
  expect(media.style.transform).toContain('scale(1)')
})

test('mouse Fit press anchors at the pointer; subsequent Space preserves the image point at viewport center', async () => {
  const media = await readyImage(3200, 2400)
  const down = new MouseEvent('pointerdown', { bubbles: true, cancelable: true, button: 0, buttons: 1, clientX: 600, clientY: 300 })
  Object.defineProperties(down, { pointerType: { value: 'mouse' }, pointerId: { value: 1 }, isPrimary: { value: true } })
  act(() => { media.dispatchEvent(down) })
  expect(ref.current!.getState().nativePercent).toBe(50)
  expect(media.style.transform).toContain('translate(-200px, 0px)')
  space()
  expect(ref.current!.getState().nativePercent).toBe(100)
  expect(media.style.transform).toContain('translate(-400px, 0px)')
  expect(media.style.transition).toBe('none')
})

test('Space in controls does not trigger image zoom, and arbitrary toolbar zoom returns to Fit', async () => {
  await readyImage(3200, 2400)
  const input = document.createElement('input')
  root.appendChild(input)
  space(input)
  space(root.querySelector('button')!)
  expect(ref.current!.getState().mode).toBe('fit')
  act(() => { ref.current!.setNative(800) })
  space()
  expect(ref.current!.getState().mode).toBe('fit')
})

test('hot language changes preserve the image DOM, zoom, pan, rotation, flip and lock state', async () => {
  const media = await readyImage(3200, 2400)
  const down = new MouseEvent('pointerdown', { bubbles: true, cancelable: true, button: 0, buttons: 1, clientX: 600, clientY: 300 })
  Object.defineProperties(down, { pointerType: { value: 'mouse' }, pointerId: { value: 1 }, isPrimary: { value: true } })
  act(() => { media.dispatchEvent(down) })
  act(() => { ref.current!.rotateCW(); ref.current!.flipHorizontal() })
  act(() => { root.querySelector<HTMLButtonElement>('button[aria-label="Lock zoom (preserve zoom when switching images)"]')!.click() })
  const transform = media.style.transform
  const state = ref.current!.getState()
  const image = media.querySelector('img')
  for (const language of ['zh-CN', 'zh-TW', 'en']) {
    act(() => { ReactDOM.render(<ImagePreview ref={ref} src='mock:test' visible progressiveMain={false}
      language={language} clickZoomEnabled doubleClickEnabled={false} closeOnMaskClick
      stops={[10,25,50,75,100,150,200,800]} />, root) })
    expect(root.querySelector('[data-preview-media]')).toBe(media)
    expect(media.querySelector('img')).toBe(image)
    expect(media.style.transform).toBe(transform)
    expect(ref.current!.getState()).toEqual(state)
    expect(root.querySelector(`button[aria-label="${resolveStrings(language).unlockZoom}"]`)).not.toBeNull()
    expect(root.querySelector('[role="dialog"]')!.getAttribute('aria-label'))
      .toBe(language === 'zh-CN' ? '图片预览' : language === 'zh-TW' ? '圖片預覽' : 'Image preview')
  }
})
