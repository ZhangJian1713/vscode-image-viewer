/** @jest-environment jsdom */
import React, { useState } from 'react'
import ReactDOM from 'react-dom'
import { act } from 'react-dom/test-utils'
import type { GalleryEntry } from '../../galleryEntry'
import { MESSAGE_CMD } from '../../constants'
import { buildGalleryFolderIndex, completeGalleryImages } from './galleryModel'
import { callGalleryHost } from './galleryBridge'
import { useGalleryEntryNavigation } from './useGalleryEntryNavigation'

jest.mock('./galleryBridge', () => ({ callGalleryHost: jest.fn() }))
const host = callGalleryHost as jest.Mock
const images = completeGalleryImages([{ path: '/assets/photos/a.jpg', vscodePath: 'a', size: 1 }], '/project')
const index = buildGalleryFolderIndex(images, '/project')
let api: ReturnType<typeof useGalleryEntryNavigation>
let root: HTMLDivElement
const locate = jest.fn()
const open = jest.fn()
const reset = jest.fn()
const entry = (path: string, kind: GalleryEntry['kind']): GalleryEntry =>
  ({ __imageViewerEntry: true, rootPath: '/project', targetPath: '/project' + path, kind })
const initial = entry('/assets/configs/app.json', 'file')
function Harness({ ready = true, complete = false }: { ready?: boolean; complete?: boolean }) {
  const [visible, setVisible] = useState(new Map<string, number>())
  api = useGalleryEntryNavigation({ initialEntry: initial, ready, complete, root: '/project', images, index,
    visibleIndexes: visible, onReset: reset, onLocate: (result, id) => {
      locate(result, id)
      setVisible(new Map(result.image ? [[result.image.fullPath, 0]] : []))
    }, onOpen: open })
  return null
}
function render(props: { ready?: boolean; complete?: boolean } = {}) {
  act(() => { ReactDOM.render(<Harness {...props} />, root) })
}
function reply(call: number, value: unknown) { act(() => { host.mock.calls[call][1](value) }) }
beforeEach(() => { jest.clearAllMocks(); root = document.createElement('div'); document.body.appendChild(root) })
afterEach(() => { act(() => { ReactDOM.unmountComponentAtNode(root) }); root.remove() })

test('waits for scan completion before nearest-ancestor fallback, then resolves without another scan', () => {
  render({ ready: false })
  expect(host).not.toHaveBeenCalled()
  render()
  expect(host.mock.calls[0][0]).toEqual({ cmd: MESSAGE_CMD.RESOLVE_GALLERY_ENTRY,
    data: { projectRoot: '/project', targetPath: initial.targetPath } })
  reply(0, { entry: initial })
  expect(locate).not.toHaveBeenCalled()
  render({ complete: true })
  expect(locate).toHaveBeenLastCalledWith(expect.objectContaining({ folder: '/project/assets', fallback: true }), expect.any(Number))
  act(() => { api.navigate(entry('/assets/photos', 'folder')) })
  reply(1, { entry: entry('/assets/photos', 'folder') })
  expect(locate).toHaveBeenLastCalledWith(expect.objectContaining({ folder: '/project/assets/photos' }), expect.any(Number))
  expect(host.mock.calls.every(([request]) => request.cmd === MESSAGE_CMD.RESOLVE_GALLERY_ENTRY)).toBe(true)
  expect(open).not.toHaveBeenCalled()
})
test('a requested image opens after its directory has been selected, even before the full root scan ends', () => {
  render()
  act(() => { api.navigate(entry('/assets/photos/a.jpg', 'image')) })
  reply(1, { entry: entry('/assets/photos/a.jpg', 'image'), image: images[0] })
  expect(locate).toHaveBeenLastCalledWith(expect.objectContaining({ folder: '/project/assets/photos', image: images[0] }), expect.any(Number))
  expect(open).toHaveBeenCalledTimes(1)
  expect(open).toHaveBeenCalledWith(images[0], false)
})
test('new navigation wins over a late metadata response and does not replay the initial command', () => {
  render({ ready: false })
  const latest = entry('/assets/photos', 'folder')
  act(() => { api.navigate(initial); api.navigate(latest) })
  reply(1, { entry: latest })
  reply(0, { entry: initial })
  render({ ready: true, complete: true })
  expect(host).toHaveBeenCalledTimes(2)
  expect(locate).toHaveBeenCalledTimes(1)
  expect(locate.mock.calls[0][0].folder).toBe('/project/assets/photos')
})
test('standalone preview for an excluded image does not require a matching thumbnail or widen the index', () => {
  render({ complete: true })
  const excluded = completeGalleryImages([{ path: '/excluded/a.jpg', vscodePath: 'excluded', size: 1 }], '/project')[0]
  act(() => { api.navigate(entry('/excluded/a.jpg', 'image')) })
  reply(1, { entry: entry('/excluded/a.jpg', 'image'), image: excluded })
  expect(open).toHaveBeenCalledWith(excluded, true)
  expect(index.folders.has('/project/excluded')).toBe(false)
  expect(api.notice).toMatch(/preview only/)
})
