/** @jest-environment jsdom */
import React from 'react'
import ReactDOM from 'react-dom'
import { act } from 'react-dom/test-utils'
import PreviewImages from './index'
import { callGalleryHost } from './galleryBridge'
import { MESSAGE_CMD } from '../../constants'
import type { IImage } from './imageTypes'

let mockGalleryProps: any
let mockFolderProps: any
const mockSetPreference = jest.fn()
jest.mock('./gallery.css', () => ({}))
jest.mock('./AnnouncementBar', () => ({ AnnouncementBar: () => null }))
jest.mock('./GallerySettingsModal', () => ({ GallerySettingsModal: () => null }))
jest.mock('../../vendor/right-image-preview', () => ({ ImagePreview: () => null }))
jest.mock('../WebviewThemeContext', () => ({ useWebviewTheme: () => ({
  preference: 'follow', setPreference: mockSetPreference
}) }))
jest.mock('../resourceCache/ResourceCacheBoundary', () => ({ useResourceCacheSlot: () => {} }))
jest.mock('./galleryBridge', () => ({ callGalleryHost: jest.fn() }))
jest.mock('./FolderSidebar', () => ({ FolderSidebar: (props) => { mockFolderProps = props; return null } }))
jest.mock('./VirtualGallery', () => ({ VirtualGallery: (props: { images: IImage[]; onFolder: (_image: IImage) => void }) => {
  mockGalleryProps = props
  return <button onClick={() => props.onFolder(props.images[0])}>Reveal folder</button>
} }))

const host = callGalleryHost as jest.Mock
const stored = { keyword: 'target', showImageTypes: ['jpg'], gallerySelectedFolder: '/project',
  gallerySidebarVisible: false, galleryExpandedFolders: [], galleryIncludeSubfolders: false,
  includeFolders: [], excludeFolders: [] }
const images = [
  { path: '/photos/target.jpg', vscodePath: 'target', size: 1 },
  { path: '/photos/neighbor.jpg', vscodePath: 'neighbor', size: 1 },
  { path: '/photos/hidden.png', vscodePath: 'hidden', size: 1 },
  { path: '/photos/deep/child.jpg', vscodePath: 'child', size: 1 },
  { path: '/other/unrelated.jpg', vscodePath: 'unrelated', size: 1 }
]
let root: HTMLDivElement
beforeEach(() => {
  jest.useFakeTimers()
  jest.clearAllMocks()
  mockFolderProps = undefined
  host.mockImplementation((request, callback) => {
    if (request.cmd === MESSAGE_CMD.GET_CONFIG) { callback(stored) }
    if (request.cmd === MESSAGE_CMD.GET_ALL_IMGS) {
      callback({ imgs: images, projectPath: '/project', complete: true, requestId: request.data.requestId })
    }
  })
  window.matchMedia = jest.fn().mockImplementation(() => ({ matches: false,
    addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} }))
  root = document.createElement('div')
  document.body.appendChild(root)
})
afterEach(() => {
  act(() => { ReactDOM.unmountComponentAtNode(root) })
  root.remove()
  jest.clearAllTimers()
  jest.useRealTimers()
})

test('a search result reveals its directory and neighbors, retains filters, and reuses the scan', () => {
  // Start inside the recursive project scope, with the sidebar hidden.
  host.mockImplementationOnce((_request, callback) => callback({ ...stored, galleryIncludeSubfolders: true }))
  act(() => { ReactDOM.render(<PreviewImages />, root) })
  expect(mockGalleryProps.images.map((image) => image.fileName)).toEqual(['target.jpg'])
  expect(mockFolderProps).toBeUndefined()
  act(() => { Array.from(root.querySelectorAll('button')).find((button) => button.textContent === 'Reveal folder')!.click() })
  expect(mockFolderProps.selected).toBe('/project/photos')
  expect(mockFolderProps.expanded).toEqual(['/project', '/project/photos'])
  expect(mockFolderProps.revealRequest.path).toBe('/project/photos')
  expect(mockGalleryProps.revealImage.path).toBe('/project/photos/target.jpg')
  expect(mockGalleryProps.images.map((image) => image.fileName)).toEqual(['neighbor.jpg', 'target.jpg', 'child.jpg'])
  expect(root.querySelector<HTMLInputElement>('input[aria-label="Search images"]')!.value).toBe('')

  // The original saved search survives and can be restored without rescanning.
  act(() => { jest.advanceTimersByTime(350) })
  const save = host.mock.calls.filter(([request]) => request.cmd === MESSAGE_CMD.SAVE_CONFIG).pop()![0].data
  expect(save).toMatchObject({ keyword: 'target', showImageTypes: ['jpg'], gallerySidebarVisible: true })
  const restore = Array.from(root.querySelectorAll('button')).find((button) => button.textContent === 'Restore filters')!
  act(() => { restore.click() })
  expect(mockGalleryProps.images.map((image) => image.fileName)).toEqual(['target.jpg'])
  expect(host.mock.calls.filter(([request]) => request.cmd === MESSAGE_CMD.GET_ALL_IMGS)).toHaveLength(1)
  expect(host.mock.calls.some(([request]) => request.cmd === MESSAGE_CMD.GALLERY_RESOURCE_ACTION ||
    request.cmd === MESSAGE_CMD.RESOLVE_GALLERY_ENTRY)).toBe(false)
})

test('repeated reveal within the selected folder still locates the image and preserves nonrecursive scope', () => {
  host.mockImplementationOnce((_request, callback) => callback({ ...stored,
    gallerySelectedFolder: '/project/photos', gallerySidebarVisible: true }))
  act(() => { ReactDOM.render(<PreviewImages />, root) })
  const reveal = Array.from(root.querySelectorAll('button')).find((button) => button.textContent === 'Reveal folder')!
  act(() => { reveal.click() })
  expect(mockGalleryProps.images.map((image) => image.fileName)).toEqual(['neighbor.jpg', 'target.jpg'])
  const id = mockFolderProps.revealRequest.id
  const imageId = mockGalleryProps.revealImage.id
  act(() => { reveal.click() })
  expect(mockFolderProps.revealRequest.id).toBeGreaterThan(id)
  expect(mockGalleryProps.revealImage.id).toBeGreaterThan(imageId)
  expect(mockFolderProps.recursive).toBe(false)
})
