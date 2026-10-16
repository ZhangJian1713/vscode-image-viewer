import { createGalleryFileWatcher } from './galleryFileWatcher'
import { MESSAGE_CMD } from '../../constants'
import { workspace } from 'vscode'

function mockEvent() {
  const listeners = new Set<(value?: any) => void>()
  return {
    subscribe: jest.fn((listener) => { listeners.add(listener); return { dispose: () => listeners.delete(listener) } }),
    fire: (value?: any) => listeners.forEach((listener) => listener(value))
  }
}
let mockCreate: ReturnType<typeof mockEvent>
let mockChange: ReturnType<typeof mockEvent>
let mockDelete: ReturnType<typeof mockEvent>
let mockDispose: jest.Mock
jest.mock('vscode', () => ({
  Uri: { file: (fsPath) => ({ fsPath }) },
  RelativePattern: jest.fn((baseUri, pattern) => ({ baseUri, pattern })),
  workspace: { createFileSystemWatcher: jest.fn(() => ({
    onDidCreate: mockCreate.subscribe, onDidChange: mockChange.subscribe,
    onDidDelete: mockDelete.subscribe, dispose: mockDispose
  })) }
}), { virtual: true })

let viewState: ReturnType<typeof mockEvent>
let panel: any
let watcher: ReturnType<typeof createGalleryFileWatcher>
const file = (fsPath: string) => ({ fsPath })
const tick = (ms = 3000) => jest.advanceTimersByTime(ms)
function initialScan(id = 1) { watcher.endScan(watcher.beginScan(id)) }
beforeEach(() => {
  jest.useFakeTimers(); jest.clearAllMocks()
  mockCreate = mockEvent(); mockChange = mockEvent(); mockDelete = mockEvent(); viewState = mockEvent()
  mockDispose = jest.fn()
  panel = { visible: true, onDidChangeViewState: viewState.subscribe, webview: { postMessage: jest.fn().mockResolvedValue(true) } }
  watcher = createGalleryFileWatcher(panel, '/project')
})
afterEach(() => { watcher.dispose(); jest.clearAllTimers(); jest.useRealTimers() })

test('watches the bound root recursively and coalesces directory-only copies and image changes after 3s quiet', () => {
  expect(workspace.createFileSystemWatcher).toHaveBeenCalledWith({ baseUri: { fsPath: '/project' }, pattern: '**/*' })
  initialScan()
  mockCreate.fire(file('/project/copied-folder'))
  tick(2900)
  mockChange.fire(file('/project/copied-folder/a.JPG'))
  tick(2999)
  expect(panel.webview.postMessage).not.toHaveBeenCalled()
  tick(1)
  expect(panel.webview.postMessage).toHaveBeenCalledTimes(1)
  expect(panel.webview.postMessage).toHaveBeenCalledWith({ cmd: MESSAGE_CMD.GALLERY_FILES_CHANGED,
    data: { projectPath: '/project', requestId: 1 } })
  initialScan(2); tick(6000)
  expect(panel.webview.postMessage).toHaveBeenCalledTimes(1)
})

test('directory rename/delete events without an image suffix invalidate the tree', () => {
  initialScan()
  mockDelete.fire(file('/project/old-folder'))
  mockCreate.fire(file('/project/new-folder'))
  tick()
  expect(panel.webview.postMessage).toHaveBeenCalledTimes(1)
  initialScan(2)
  mockDelete.fire(file('/project/new-folder/a.jpg'))
  tick()
  expect(panel.webview.postMessage).toHaveBeenCalledTimes(2)
})

test('does not interrupt long scans and follows up once for changes received during the scan', () => {
  const scan = watcher.beginScan(1)
  for (let i = 0; i < 6; i++) { mockCreate.fire(file(`/project/copy${i}`)); tick(4000) }
  expect(panel.webview.postMessage).not.toHaveBeenCalled()
  watcher.endScan(scan); tick(1)
  expect(panel.webview.postMessage).toHaveBeenCalledTimes(1)
  const followup = watcher.beginScan(2)
  tick(6000); watcher.endScan(followup); tick(6000)
  expect(panel.webview.postMessage).toHaveBeenCalledTimes(1)
})

test('changes near the end of a scan still wait for the remainder of the quiet period', () => {
  const scan = watcher.beginScan(1)
  mockChange.fire(file('/project/a.png')); tick(500)
  watcher.endScan(scan); tick(2499)
  expect(panel.webview.postMessage).not.toHaveBeenCalled()
  tick(1)
  expect(panel.webview.postMessage).toHaveBeenCalledTimes(1)
})

test('startup/manual scans cover pending events and superseded completions cannot unlock a new scan', () => {
  mockCreate.fire(file('/project/before-webview-ready')); tick(5000)
  expect(panel.webview.postMessage).not.toHaveBeenCalled()
  initialScan(); tick(5000)
  expect(panel.webview.postMessage).not.toHaveBeenCalled()
  const old = watcher.beginScan(2)
  const current = watcher.beginScan(3)
  mockCreate.fire(file('/project/during-current')); tick(5000)
  watcher.endScan(old); tick(5000)
  expect(panel.webview.postMessage).not.toHaveBeenCalled()
  watcher.endScan(current); tick(1)
  expect(panel.webview.postMessage.mock.calls[0][0].data.requestId).toBe(3)
})

test('hidden panels retain changes and refresh when revealed without duplicate notifications', () => {
  initialScan()
  panel.visible = false; viewState.fire()
  mockCreate.fire(file('/project/copied')); tick(5000)
  expect(panel.webview.postMessage).not.toHaveBeenCalled()
  panel.visible = true; viewState.fire(); tick(1)
  expect(panel.webview.postMessage).toHaveBeenCalledTimes(1)
  viewState.fire(); tick(5000)
  expect(panel.webview.postMessage).toHaveBeenCalledTimes(1)
})

test('ignores other roots, skipped directories, AppleDouble and non-image content changes', () => {
  initialScan()
  for (const fsPath of ['/project-other/a.jpg', '/outside/a.jpg', '/project/.git/a.jpg',
    '/project/node_modules/p/a.jpg', '/project/photos/._a.jpg']) {
    mockCreate.fire(file(fsPath)); mockChange.fire(file(fsPath)); mockDelete.fire(file(fsPath))
  }
  mockChange.fire(file('/project/code.ts')); tick(5000)
  expect(panel.webview.postMessage).not.toHaveBeenCalled()
})

test('disposal clears pending timers, subscriptions and watcher even if a scan completes later', () => {
  initialScan()
  mockCreate.fire(file('/project/a.jpg'))
  watcher.dispose(); tick(5000)
  mockCreate.fire(file('/project/b.jpg')); viewState.fire(); tick(5000)
  expect(panel.webview.postMessage).not.toHaveBeenCalled()
  expect(mockDispose).toHaveBeenCalledTimes(1)
})

test('an undelivered invalidation can be retried on reveal without a polling loop', async () => {
  initialScan()
  panel.webview.postMessage.mockResolvedValueOnce(false)
  mockCreate.fire(file('/project/copied')); tick()
  await panel.webview.postMessage.mock.results[0].value
  tick(6000)
  expect(panel.webview.postMessage).toHaveBeenCalledTimes(1)
  viewState.fire(); tick(1)
  expect(panel.webview.postMessage).toHaveBeenCalledTimes(2)
})
