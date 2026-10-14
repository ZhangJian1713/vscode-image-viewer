/** @jest-environment jsdom */
import React from 'react'
import ReactDOM from 'react-dom'
import { act } from 'react-dom/test-utils'
import { VirtualGallery } from './VirtualGallery'
import { completeGalleryImages } from './galleryModel'
import { Modal } from 'antd'
import { webviewI18n } from '../../i18n/react'
jest.mock('./scrollbarFolders.css', () => ({}))

jest.mock('./galleryBridge', () => ({ callGalleryHost: jest.fn((_request, callback) => callback?.({ kind: 'original' })) }))
jest.mock('./GalleryThumbnail', () => ({ useGalleryThumbnail: () => ({ status: 'ready', src: 'fixture' }),
  GalleryThumbnail: () => <span /> }))
jest.mock('antd', () => ({ Dropdown: ({ children, menu, trigger }: {
  children: React.ReactNode; menu: any; trigger: string[]
}) => trigger.includes('contextMenu')
  ? <div>{children}{menu.items.filter((item) => item.key).map((item) =>
    <button key={item.key} onClick={(domEvent) => menu.onClick({ key: item.key, domEvent })}>{item.label}</button>)}</div>
  : children, Modal: { confirm: jest.fn() }, message: {} }))
const images = completeGalleryImages(Array.from({ length: 10000 }, (_, i) => ({ path: `/image-${i}.jpg`, vscodePath: String(i), size: 1 })), '/project')
let root: HTMLDivElement
let width: number
const sizing = jest.fn()
const folders = jest.fn()
const onFolder = jest.fn()
function render(id = 1) {
  act(() => { ReactDOM.render(<VirtualGallery images={images} root='/project' scopeKey='scope'
    mode='grid' compact={false} showFileSize columns={8} listThumbSize={64} background='transparent'
    onThumbnailSizing={sizing} onViewportFolders={folders} hudRoot='/project' active={false} groupByFolder
    revealImage={{ id, path: images[9500].fullPath }} onOpen={() => {}} onFolder={onFolder} onDeleted={() => {}} />, root) })
}
beforeEach(() => {
  jest.useFakeTimers()
  jest.clearAllMocks()
  window.requestAnimationFrame = (callback) => window.setTimeout(() => callback(0), 16)
  window.cancelAnimationFrame = (id) => window.clearTimeout(id)
  width = 1200
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => width })
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, get: () => 600 })
  global.ResizeObserver = class { observe() {} disconnect() {} unobserve() {} } as any
  root = document.createElement('div'); document.body.appendChild(root)
})
test('image menu distinguishes local folder reveal from the Explorer action', () => {
  render()
  const card = root.querySelector(`[data-image-id="${images[9500].fullPath}"]`)!
  const buttons = Array.from(card.parentElement!.querySelectorAll('button'))
  expect(buttons.some((button) => button.textContent === 'Reveal in Explorer')).toBe(true)
  act(() => { buttons.find((button) => button.textContent === 'Reveal in Image folders')!.click() })
  expect(onFolder).toHaveBeenCalledWith(images[9500])
})
afterEach(() => {
  act(() => { ReactDOM.unmountComponentAtNode(root) }); root.remove()
  delete (HTMLElement.prototype as any).clientWidth; delete (HTMLElement.prototype as any).clientHeight
  jest.clearAllTimers(); jest.useRealTimers()
})
test('reveal centers and highlights an offscreen image while the preview is open, without mounting the whole wall', () => {
  render()
  const area = root.querySelector('.iv-gallery-scroll') as HTMLDivElement
  expect(area.scrollTop).toBeGreaterThan(100000)
  const card = root.querySelector(`[data-image-id="${images[9500].fullPath}"]`)
  expect(card?.getAttribute('aria-pressed')).toBe('true')
  expect(card?.className).toContain('is-selected')
  expect(root.querySelectorAll('.iv-gallery-card').length).toBeLessThan(100)
  // A rerender of the same intent must not override a user's subsequent scroll.
  act(() => { area.scrollTop = 1000; area.dispatchEvent(new Event('scroll')); jest.advanceTimersByTime(16) })
  render()
  expect(area.scrollTop).toBe(1000)
  render(2)
  expect(area.scrollTop).toBeGreaterThan(100000)
})

test('an open trash confirmation changes language in place without executing or replacing the pending action', async () => {
  await webviewI18n.changeLanguage('en')
  render()
  const card = root.querySelector(`[data-image-id="${images[9500].fullPath}"]`)!
  const trash = Array.from(card.parentElement!.querySelectorAll('button')).find((button) => button.textContent === 'Move to Trash…')!
  act(() => { trash.click() })
  const confirmation = (Modal.confirm as jest.Mock).mock.calls[0][0]
  const popup = document.createElement('div'); document.body.appendChild(popup)
  try {
    act(() => { ReactDOM.render(<div>{confirmation.title}{confirmation.content}{confirmation.okText}{confirmation.cancelText}</div>, popup) })
    expect(popup.textContent).toContain('Move “')
    await act(async () => { await webviewI18n.changeLanguage('zh-TW') })
    expect(popup.textContent).toContain('移至資源回收筒')
    expect(popup.textContent).toContain(images[9500].fileName)
    expect(Modal.confirm).toHaveBeenCalledTimes(1)
    expect((Modal.confirm as jest.Mock).mock.calls[0][0].onOk).toBe(confirmation.onOk)
  } finally { act(() => { ReactDOM.unmountComponentAtNode(popup) }); popup.remove() }
})
