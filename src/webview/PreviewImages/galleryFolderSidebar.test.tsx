/** @jest-environment jsdom */
import React from 'react'
import ReactDOM from 'react-dom'
import { act } from 'react-dom/test-utils'
import { FolderSidebar } from './FolderSidebar'
import { buildGalleryFolderIndex, completeGalleryImages } from './galleryModel'
import type { GalleryFolderHighlight } from './galleryViewportFolders'

let mockTreeProps: any
const mockScrollTo = jest.fn()
jest.mock('antd', () => {
  const react = require('react')
  const actual = jest.requireActual('antd')
  return { ...actual, Tree: class MockTree extends react.Component {
    scrollTo(options) { mockScrollTo(options) }
    render() { mockTreeProps = this.props; return react.createElement('div') }
  } }
})
jest.mock('./FolderFilterFields', () => ({ FolderFilterFields: () => null }))

const index = buildGalleryFolderIndex(completeGalleryImages([
  { path: '/a/b/1.png', vscodePath: 'a', size: 1 },
  { path: '/a/b/deep/3.png', vscodePath: 'c', size: 1 },
  { path: '/c/d/2.png', vscodePath: 'b', size: 1 }
], '/project'), '/project')
const onExpanded = jest.fn()
const onSelect = jest.fn()
let root: HTMLDivElement
function render(highlight: GalleryFolderHighlight | null, expanded = ['/project']) {
  act(() => { ReactDOM.render(<FolderSidebar index={index} selected='/project' expanded={expanded}
    viewportHighlight={highlight} recursive width={230} includeFolders={[]} excludeFolders={[]}
    onExpanded={onExpanded} onSelect={onSelect} onApplyFilters={() => {}} onWidth={() => {}}
    onHide={() => {}} onRecursive={() => {}} onRefresh={() => {}} onAction={() => {}} />, root) })
}
beforeEach(() => {
  jest.clearAllMocks()
  jest.useFakeTimers()
  window.ResizeObserver = class { observe() {} disconnect() {} unobserve() {} } as typeof ResizeObserver
  window.requestAnimationFrame = (callback) => window.setTimeout(() => callback(0), 16)
  window.cancelAnimationFrame = (id) => window.clearTimeout(id)
  root = document.createElement('div')
  document.body.appendChild(root)
})
afterEach(() => {
  act(() => { ReactDOM.unmountComponentAtNode(root) })
  root.remove()
  jest.clearAllTimers()
  jest.useRealTimers()
})

test('live viewport expands and reveals folders without changing selection or saving transient ancestors', () => {
  render({ live: true, paths: ['/project/a/b', '/project/c/d'] })
  expect(mockTreeProps.expandedKeys).toEqual(['/project', '/project/a', '/project/c'])
  expect(mockTreeProps.selectedKeys).toEqual(['/project'])
  expect(onExpanded).not.toHaveBeenCalled()
  expect(onSelect).not.toHaveBeenCalled()
  act(() => { jest.advanceTimersByTime(16) })
  expect(mockScrollTo).toHaveBeenCalledWith(0)
  render({ live: false, paths: ['/project/c/d'] })
  expect(mockTreeProps.expandedKeys).toEqual(['/project', '/project/c'])
})

test('a landed ancestor can be collapsed, and user persistence contains only the explicitly changed node', () => {
  render({ live: false, paths: ['/project/c/d'] })
  act(() => { mockTreeProps.onExpand([], { node: { key: '/project/c' }, expanded: false }) })
  expect(mockTreeProps.expandedKeys).toEqual(['/project'])
  expect(onExpanded).toHaveBeenLastCalledWith(['/project'])
  act(() => { mockTreeProps.onExpand([], { node: { key: '/project/a' }, expanded: true }) })
  expect(onExpanded).toHaveBeenLastCalledWith(['/project', '/project/a'])
  render(null)
  expect(mockTreeProps.expandedKeys).toEqual(['/project'])
})

test('live tracking replaces saved expansion and collapses branches as they leave the viewport', () => {
  const saved = ['/project', '/project/a', '/project/a/b', '/project/c']
  render(null, saved)
  expect(mockTreeProps.expandedKeys).toEqual(saved)
  render({ live: true, paths: ['/project/a/b/deep', '/project/c/d'] }, saved)
  expect(mockTreeProps.expandedKeys).toEqual(['/project', '/project/a', '/project/a/b', '/project/c'])
  render({ live: true, paths: ['/project/c/d'] }, saved)
  expect(mockTreeProps.expandedKeys).toEqual(['/project', '/project/c'])
  render({ live: true, paths: ['/project/a/b'] }, saved)
  // Direct images in b do not require opening b's offscreen descendants.
  expect(mockTreeProps.expandedKeys).toEqual(['/project', '/project/a'])
  render({ live: true, paths: ['/project'] }, saved)
  expect(mockTreeProps.expandedKeys).toEqual(['/project'])
  expect(mockTreeProps.selectedKeys).toEqual(['/project'])
  expect(onExpanded).not.toHaveBeenCalled()
  expect(onSelect).not.toHaveBeenCalled()
  // Release restores deliberate manual expansion, rather than saving the temporary tree.
  render({ live: false, paths: ['/project/c/d'] }, saved)
  expect(mockTreeProps.expandedKeys).toEqual(saved)
})

test('live tracking overrides search expansion without clearing the folder search', () => {
  render(null)
  const input = root.querySelector<HTMLInputElement>('input[aria-label="Find folder"]')!
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, 'deep')
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
  expect(mockTreeProps.expandedKeys).toEqual(['/project', '/project/a', '/project/a/b', '/project/a/b/deep'])
  render({ live: true, paths: ['/project/a/b'] })
  expect(mockTreeProps.expandedKeys).toEqual(['/project', '/project/a'])
  expect(input.value).toBe('deep')
  render(null)
  expect(mockTreeProps.expandedKeys).toContain('/project/a/b')
})
