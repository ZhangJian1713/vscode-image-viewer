/** @jest-environment jsdom */
import React from 'react'
import ReactDOM from 'react-dom'
import { act } from 'react-dom/test-utils'
import { ImagePreview, resolveStrings } from 'right-image-preview'
import type { ImagePreviewProps, ImagePreviewRef } from 'right-image-preview'
import { PREVIEW_ZOOM_STOPS } from './previewZoomStops'

let root: HTMLDivElement
let ref: React.RefObject<ImagePreviewRef>
const images = [{ src: 'test:package-image', name: 'image.png' }]
const rect = { x: 0, y: 0, left: 0, top: 0, right: 800, bottom: 600, width: 800, height: 600 } as DOMRect

beforeEach(() => {
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

function renderPreview(language = 'en', props: Partial<ImagePreviewProps> = {}) {
  act(() => { ReactDOM.render(<ImagePreview ref={ref} images={images} visible
    progressiveMain={false} preloadRadius={0} preloadDisplaySlots={0}
    stops={PREVIEW_ZOOM_STOPS} fitMaxNativePercent={100}
    clickZoomEnabled doubleClickEnabled={false} language={language} {...props} />, root) })
}

async function readyImage(width: number, height: number, props: Partial<ImagePreviewProps> = {}) {
  renderPreview('en', props)
  const image = root.querySelector('img[src="test:package-image"]')!
  Object.defineProperties(image, { naturalWidth: { value: width }, naturalHeight: { value: height }, complete: { value: true } })
  ;(image as HTMLImageElement).decode = () => Promise.resolve()
  root.querySelector('[data-rip-floor="hit"]')!.parentElement!.getBoundingClientRect = () => rect
  await act(async () => {
    image.dispatchEvent(new Event('load'))
    // Let the packed implementation finish decode and presentation frames.
    await new Promise((resolve) => window.setTimeout(resolve, 30))
  })
  return image as HTMLImageElement
}

function space() {
  act(() => { root.querySelector('[role="dialog"]')!.dispatchEvent(
    new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true })) })
}

test('the component build supports React 17 adaptive zoom and state-preserving Traditional Chinese updates', async () => {
  const image = await readyImage(3200, 2400)
  expect(ref.current!.getState().fitEquivalentNativePercent).toBe(25)
  space()
  expect(ref.current!.getState().nativePercent).toBe(50)
  space()
  expect(ref.current!.getState().nativePercent).toBe(100)
  const transform = image.parentElement!.style.transform
  const state = ref.current!.getState()
  for (const language of ['zh-CN', 'zh-TW', 'en']) {
    renderPreview(language)
    expect(root.querySelector('img[src="test:package-image"]')).toBe(image)
    expect(image.parentElement!.style.transform).toBe(transform)
    expect(ref.current!.getState()).toEqual(state)
    expect(root.querySelector('[role="dialog"]')!.getAttribute('aria-label')).toBe(resolveStrings(language).imagePreview)
  }
  expect(root.querySelector('canvas')).toBeNull()
})

test('small-image Fit and wheel boundaries use the component package implementation', async () => {
  await readyImage(100, 100)
  expect(ref.current!.getState().fitEquivalentNativePercent).toBe(100)
  space()
  expect(ref.current!.getState().nativePercent).toBe(200)
  space()
  expect(ref.current!.getState().mode).toBe('fit')
  act(() => { root.querySelector('[role="dialog"]')!.dispatchEvent(new WheelEvent('wheel', {
    deltaY: 1, deltaMode: 1, clientX: 400, clientY: 300, bubbles: true, cancelable: true
  })) })
  expect(ref.current!.getState().nativePercent).toBe(75)
  act(() => { ref.current!.setNative(800); ref.current!.zoomIn() })
  expect(ref.current!.getState().nativePercent).toBe(800)
})

function mousePointer(target: Element | Window, type: string, x: number, y: number) {
  const event = new MouseEvent(type, { bubbles: true, cancelable: true, button: 0,
    buttons: type === 'pointerup' ? 0 : 1, clientX: x, clientY: y })
  Object.defineProperties(event, { pointerId: { value: 1 }, pointerType: { value: 'mouse' },
    isPrimary: { value: true } })
  act(() => { target.dispatchEvent(event) })
}

test('React 17 pointer sessions preserve anchors and separate pan from click', async () => {
  const image = await readyImage(3200, 2400)
  const hit = root.querySelector('[data-rip-floor="hit"]') as HTMLDivElement
  hit.setPointerCapture = jest.fn()
  hit.hasPointerCapture = () => false
  mousePointer(hit, 'pointerdown', 600, 300)
  expect(ref.current!.getState().nativePercent).toBe(50)
  expect(image.parentElement!.style.transform).toContain('translate(-200px, 0px)')
  mousePointer(hit, 'pointermove', 650, 350)
  mousePointer(window, 'pointerup', 650, 350)
  expect(image.parentElement!.style.transform).toContain('translate(-200px, 0px)')
  act(() => { ref.current!.setNative(100) })
  mousePointer(hit, 'pointerdown', 400, 300)
  mousePointer(hit, 'pointermove', 420, 300)
  mousePointer(window, 'pointerup', 420, 300)
  expect(ref.current!.getState().nativePercent).toBe(100)
  expect(image.parentElement!.style.transform).toContain('translate(-380px, 0px)')
})


test('the local package warms adjacent DOM slots and promotes the same image node', async () => {
  const nearby = [{ src: 'test:before' }, ...images, { src: 'test:after' }]
  await readyImage(3200, 2400, { images: nearby, defaultIndex: 1,
    preloadRadius: 1, preloadDisplaySlots: 2, preloadDisplayMode: 'slot' })
  expect(root.querySelector('img[src="test:before"]')).toBeNull()
  expect(root.querySelector('img[src="test:after"]')).toBeNull()
  await act(async () => { await new Promise((resolve) => window.setTimeout(resolve, 650)) })
  const previous = root.querySelector('img[src="test:before"]')
  const next = root.querySelector('img[src="test:after"]') as HTMLImageElement
  expect(previous).not.toBeNull()
  expect(next).not.toBeNull()
  Object.defineProperties(next, { naturalWidth: { value: 3200 }, naturalHeight: { value: 2400 }, complete: { value: true } })
  next.decode = () => Promise.resolve()
  await act(async () => {
    next.dispatchEvent(new Event('load'))
    await new Promise((resolve) => window.setTimeout(resolve, 30))
  })
  await act(async () => {
    ref.current!.next()
    await new Promise((resolve) => window.setTimeout(resolve, 30))
  })
  expect(root.querySelector('img[src="test:after"]')).toBe(next)
  expect(next.parentElement!.style.transform).toContain('scale(0.25)')
})

test('the local React 17 build delegates its fullscreen button to the host callback', async () => {
  const toggle = jest.fn(async () => {})
  const image = await readyImage(3200, 2400, { fullscreen: { toggle },
    strings: { toggleFullscreen: 'Toggle VS Code window fullscreen' } })
  const pose = image.parentElement!.style.transform
  const button = root.querySelector('[aria-label="Toggle VS Code window fullscreen"]') as HTMLButtonElement
  expect(button).not.toBeNull()
  await act(async () => { button.click() })
  expect(toggle).toHaveBeenCalledTimes(1)
  expect(ref.current!.isFullscreen()).toBe(false)
  expect(root.querySelector('[aria-label="Toggle VS Code window fullscreen"]')).toBe(button)
  expect(image.parentElement!.style.transform).toBe(pose)
  await act(async () => { button.click() })
  expect(toggle).toHaveBeenCalledTimes(2)
})


test('local filmstrip URLs and visibility changes preserve main-image zoom, rotation and DOM identity', async () => {
  const items = [{ ...images[0], thumbnailSrc: null }, { src: 'test:second', thumbnailSrc: null }]
  const props = { images: items, showThumbnailToggle: true, showThumbnails: false }
  const image = await readyImage(3200, 2400, props)
  act(() => { ref.current!.setNative(100); ref.current!.rotateCW() })
  const state = ref.current!.getState()
  const updated = items.map((item, index) => ({ ...item, thumbnailSrc: `cache:${index}:200` }))
  renderPreview('en', { ...props, images: updated, showThumbnails: true })
  expect(root.querySelector('img[src="test:package-image"]')).toBe(image)
  expect(ref.current!.getState().nativePercent).toBe(state.nativePercent)
  expect(root.querySelector('img[src="cache:0:200"]')).not.toBeNull()
  renderPreview('zh-TW', { ...props, images: updated, showThumbnails: false })
  expect(root.querySelector('img[src="test:package-image"]')).toBe(image)
  expect(ref.current!.getState().nativePercent).toBe(state.nativePercent)
})

test('React 17 keeps the last painted frame while skipping an unloaded image', async () => {
  const items = [...images, { src: 'test:skipped' }, { src: 'test:incoming' }]
  const image = await readyImage(3200, 2400, { images: items })
  act(() => { ref.current!.setNative(100); ref.current!.rotateCW() })
  const pose = image.parentElement!.style.transform
  act(() => { ref.current!.goTo(1) })
  act(() => { ref.current!.goTo(2) })
  expect(root.querySelector('img[src="test:package-image"]')).toBe(image)
  expect(image.closest('[data-rip-stage-layer]')!.getAttribute('data-rip-stage-layer')).toBe('outgoing')
  expect(image.parentElement!.style.transform).toBe(pose)
  const incoming = root.querySelector<HTMLImageElement>('img[src="test:incoming"]')!
  Object.defineProperties(incoming, { complete: { value: true }, naturalWidth: { value: 2000 }, naturalHeight: { value: 1000 } })
  incoming.decode = () => Promise.resolve()
  await act(async () => { incoming.dispatchEvent(new Event('load')); await new Promise((resolve) => window.setTimeout(resolve, 30)) })
  expect(root.querySelector('[data-rip-stage-layer="outgoing"]')).toBeNull()
})
