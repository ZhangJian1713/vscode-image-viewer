/** @jest-environment jsdom */
/* eslint-disable react/prop-types, react/display-name -- Minimal toolkit fakes keep state/lifecycle tests independent of Ant Design internals. */
import React from 'react'
import ReactDOM from 'react-dom'
import { act, Simulate } from 'react-dom/test-utils'
import PreviewImages from './index'
import { LanguageProvider, webviewI18n } from '../../i18n/react'
import { callGalleryHost } from './galleryBridge'
import { MESSAGE_CMD } from '../../constants'
import { GalleryThumbnailStore } from './galleryThumbnailStore'

let mockTreeProps: any
let mockPreviewProps: any
const mockSetTheme = jest.fn()
jest.mock('./gallery.css', () => ({}))
jest.mock('./gallerySettings.css', () => ({}))
jest.mock('./scrollbarFolders.css', () => ({}))
jest.mock('./AnnouncementBar', () => ({ AnnouncementBar: () => null }))
jest.mock('../WebviewThemeContext', () => ({ useWebviewTheme: () => ({ preference: 'dark', setPreference: mockSetTheme }) }))
jest.mock('./galleryBridge', () => ({ callGalleryHost: jest.fn() }))
jest.mock('@easy_vscode/webview', () => ({ callVscode: jest.fn() }))
jest.mock('../../vendor/right-image-preview', () => ({ ImagePreview: (props) => {
  mockPreviewProps = props
  return <div data-preview='open'>{props.language}</div>
} }))
// Keep gallery, folder draft, layout, and thumbnail lifetimes real; replace only UI toolkit primitives.
jest.mock('antd', () => {
  const React = require('react')
  const Button = ({ children, onClick, ...props }) => <button onClick={onClick} aria-label={props['aria-label']}>{children}</button>
  const Input = ({ value, onChange, ...props }) => <input value={value} onChange={onChange} aria-label={props['aria-label']} />
  Input.TextArea = ({ value, onChange, ...props }) => <textarea value={value} onChange={onChange} aria-label={props['aria-label']} />
  const Checkbox = ({ children }) => <span>{children}</span>
  Checkbox.Group = () => null
  const Select = ({ value, options, onChange, disabled, ...props }) => <select value={value} disabled={disabled}
    aria-label={props['aria-label']} onChange={(event) => onChange(event.target.value)}>
    {options.flatMap((option) => option.options || [option]).map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
  </select>
  class Tabs extends React.Component {
    constructor(props) { super(props); this.state = { active: props.items[0].key } }
    render() {
      const { items } = this.props
      return <div><nav>{items.map((item) => <button key={item.key} onClick={() => this.setState({ active: item.key })}>{item.label}</button>)}</nav>
        {items.map((item) => <div key={item.key} hidden={this.state.active !== item.key} data-tab={item.key}>{item.children}</div>)}
      </div>
    }
  }
  const Wrapper = ({ children }) => <div>{children}</div>
  return { Button, Input, Checkbox, Select, Tabs, Space: Wrapper, Dropdown: Wrapper,
    Popover: Wrapper, Tooltip: Wrapper, Spin: () => null, Switch: () => null, Slider: () => null,
    Breadcrumb: () => null, Empty: ({ description }) => <p>{description}</p>,
    Modal: ({ open, title, children, footer }) => open ? <div role='dialog'>{title}{children}{footer}</div> : null,
    Typography: { Paragraph: Wrapper, Text: Wrapper },
    Tree: class extends React.Component {
      scrollTo() {}
      render() { mockTreeProps = this.props; return <div data-tree={this.props.selectedKeys.join(',')} /> }
    }, message: { error: jest.fn(), success: jest.fn() }
  }
})

const host = callGalleryHost as jest.Mock
const stored = { keyword: 'image', showImageTypes: ['jpg'], gallerySelectedFolder: '/project/photos',
  galleryExpandedFolders: ['/project', '/project/photos'], galleryIncludeSubfolders: true,
  galleryLayout: 'grid', imageSort: 'nameDesc', imageGridColumns: 8, gallerySidebarWidth: 270,
  includeFolders: [], excludeFolders: [], uiTheme: 'dark' }
const images = Array.from({ length: 1000 }, (_, i) => ({ path: `/photos/image${i}.jpg`, vscodePath: `image:${i}`, size: 100 }))
let root: HTMLDivElement
let revision: number
let destroy: jest.SpyInstance
const calls = (cmd: string) => host.mock.calls.filter(([request]) => request.cmd === cmd)

beforeEach(async () => {
  jest.useFakeTimers(); jest.clearAllMocks()
  await webviewI18n.changeLanguage('en')
  revision = 0
  destroy = jest.spyOn(GalleryThumbnailStore.prototype, 'destroy')
  host.mockImplementation((request, callback) => {
    if (request.cmd === MESSAGE_CMD.GET_UI_LANGUAGE) { callback({ ok: true, snapshot: { preference: 'auto', language: 'en', revision } }) }
    if (request.cmd === MESSAGE_CMD.SET_UI_LANGUAGE) {
      const preference = request.data.preference
      callback({ ok: true, snapshot: { preference, language: preference === 'auto' ? 'en' : preference, revision: ++revision } })
    }
    if (request.cmd === MESSAGE_CMD.GET_CONFIG) { callback(stored) }
    if (request.cmd === MESSAGE_CMD.GET_ALL_IMGS) { callback({ imgs: images, projectPath: '/project', complete: true, requestId: request.data.requestId }) }
    if (request.cmd === MESSAGE_CMD.GET_THUMB_FOR_GRID) { callback({ kind: 'original' }) }
    if (request.cmd === MESSAGE_CMD.GET_IMAGE_SIZE) { callback({ width: 600, height: 400 }) }
  })
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => 1200 })
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, get: () => 600 })
  window.ResizeObserver = class { observe() {} disconnect() {} unobserve() {} } as any
  window.requestAnimationFrame = (callback) => window.setTimeout(() => callback(0), 16)
  window.cancelAnimationFrame = (id) => window.clearTimeout(id)
  root = document.createElement('div'); document.body.appendChild(root)
  act(() => { ReactDOM.render(<LanguageProvider transport={callGalleryHost}><PreviewImages /></LanguageProvider>, root) })
})
afterEach(() => {
  act(() => { ReactDOM.unmountComponentAtNode(root) }); root.remove()
  jest.restoreAllMocks(); delete (HTMLElement.prototype as any).clientWidth; delete (HTMLElement.prototype as any).clientHeight
  jest.clearAllTimers(); jest.useRealTimers()
})

function button(label: string) { return root.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)! }
function change(element: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement, value: string) {
  act(() => { Simulate.change(element, { target: { value } } as any) })
}

test('settings options hot-switch the whole gallery while preserving browsing, drafts, preview and thumbnail resources', () => {
  act(() => { button('Folder filters').click() })
  const draft = root.querySelector<HTMLTextAreaElement>('textarea[aria-label="Folders to include"]')!
  change(draft, 'photos/**\nunsaved/**')
  const folderSearch = root.querySelector<HTMLInputElement>('input[aria-label="Find folder"]')!
  change(folderSearch, 'photos')
  const area = root.querySelector<HTMLDivElement>('.iv-gallery-scroll')!
  act(() => { area.scrollTop = 2000; area.dispatchEvent(new Event('scroll')); jest.advanceTimersByTime(16) })
  const card = root.querySelector<HTMLElement>('[data-image-id]')!
  act(() => { card.click() })
  act(() => { mockPreviewProps.onIndexChange(3) })
  const previewImages = mockPreviewProps.images
  const expanded = mockTreeProps.expandedKeys
  const selected = mockTreeProps.selectedKeys
  const scrollTop = area.scrollTop
  act(() => { button('Settings').click(); jest.advanceTimersByTime(400) })
  const language = root.querySelector<HTMLSelectElement>('select[aria-label="Language"]')!
  expect(Array.from(language.options).map((option) => [option.value, option.textContent])).toEqual([
    ['auto', 'Follow VS Code'], ['en', 'English'], ['zh-CN', '简体中文'], ['zh-TW', '繁體中文']
  ])
  const thumbnails = calls(MESSAGE_CMD.GET_THUMB_FOR_GRID).length
  const saved = calls(MESSAGE_CMD.SAVE_CONFIG).length
  for (const [value, expected] of [['zh-CN', '跟随 VS Code'], ['zh-TW', '跟隨 VS Code'], ['auto', 'Follow VS Code']]) {
    change(language, value)
    expect(language.options[0].textContent).toBe(expected)
    expect(root.querySelector('.iv-gallery-scroll')).toBe(area)
    expect(area.scrollTop).toBe(scrollTop)
    expect(root.querySelector('textarea')).toBe(draft)
    expect(draft.value).toBe('photos/**\nunsaved/**')
    expect(folderSearch.value).toBe('photos')
    expect(mockTreeProps.expandedKeys).toEqual(expanded)
    expect(mockTreeProps.selectedKeys).toEqual(selected)
    expect(mockPreviewProps.images).toBe(previewImages)
    expect(root.querySelector('[data-preview="open"]')).not.toBeNull()
    expect(root.querySelector('[role="dialog"]')).not.toBeNull()
  }
  act(() => { jest.advanceTimersByTime(400) })
  expect(calls(MESSAGE_CMD.GET_CONFIG)).toHaveLength(1)
  expect(calls(MESSAGE_CMD.GET_ALL_IMGS)).toHaveLength(1)
  expect(calls(MESSAGE_CMD.GET_THUMB_FOR_GRID)).toHaveLength(thumbnails)
  expect(calls(MESSAGE_CMD.SAVE_CONFIG)).toHaveLength(saved)
  expect(destroy).not.toHaveBeenCalled()
  expect(root.querySelector<HTMLSelectElement>('select[aria-label="Sort images"]')!.value).toBe('folder:nameDesc')
})
