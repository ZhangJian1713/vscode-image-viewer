import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import gallery from './index'
import { MESSAGE_CMD } from '../../constants'
import { getAllImgs } from './utils'
import { readLocalConfigFile, writeLocalConfigFile } from './config'
import { webviewUtils } from '@easy_vscode/core'

let mockRoots: string[] = []
jest.mock('@easy_vscode/core', () => ({ utils: { getProjectPath: () => mockRoots[0] },
  webviewUtils: { invokeCallback: jest.fn(), successResp: { ok: true } } }))
jest.mock('vscode', () => ({ Uri: { file: (fsPath: string) => ({ fsPath }) }, ViewColumn: { One: 1 },
  workspace: { get workspaceFolders() { return mockRoots.map((fsPath) => ({ uri: { fsPath } })) } },
  env: { language: 'en' }, window: {}, commands: {} }), { virtual: true })
jest.mock('./utils', () => ({ getAllImgs: jest.fn(), getImageBase64: jest.fn(), getImageSize: jest.fn(),
  SUPPORT_IMG_TYPES: ['.jpg'] }))
jest.mock('./config', () => ({ readLocalConfigFile: jest.fn(() => ({ includeFolders: [], excludeFolders: [] })), writeLocalConfigFile: jest.fn() }))
jest.mock('./thumbGridCache', () => ({ resolveThumbForGrid: jest.fn(), cacheFsPathToThumbResourceUri: jest.fn() }))
let directory: string
const callbacks = webviewUtils.invokeCallback as jest.Mock
const scan = getAllImgs as jest.Mock
const lastReply = () => callbacks.mock.calls[callbacks.mock.calls.length - 1][2]
const panel = (root = mockRoots[0]) => {
  const webview = { postMessage: jest.fn(), asWebviewUri: (uri) => ({ toString: () => uri.fsPath }) } as any
  gallery.webviewProps.onDidCreatePanel({ webview } as any,
    [{ __imageViewerEntry: true, rootPath: root, targetPath: '', kind: 'root' }], root)
  return webview
}
const handle = (cmd: string, data: unknown, webview: any) => gallery.messageHandlers.get(cmd)({ cmd, data } as any, webview)
beforeEach(() => {
  jest.clearAllMocks()
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'gallery-root-'))
  mockRoots = [path.join(directory, 'one'), path.join(directory, 'two')]
  mockRoots.forEach((root) => { fs.mkdirSync(path.join(root, 'assets'), { recursive: true }); fs.writeFileSync(path.join(root, 'assets/a.jpg'), 'fixture') })
  scan.mockResolvedValue([])
})
afterEach(() => fs.rmSync(directory, { recursive: true, force: true }))

test('configuration, scan replies and entry metadata all stay bound to the second workspace root', async () => {
  const w = panel(mockRoots[1])
  handle(MESSAGE_CMD.GET_CONFIG, { projectRoot: mockRoots[0] }, w)
  expect(readLocalConfigFile).toHaveBeenCalledWith(mockRoots[1])
  const priorityPath = path.join(mockRoots[1], 'assets/a.jpg')
  await handle(MESSAGE_CMD.GET_ALL_IMGS, { projectRoot: mockRoots[0], priorityPath, requestId: 2 }, w)
  expect(scan.mock.calls[0][3]).toMatchObject({ basePath: mockRoots[1], priorityPath })
  expect(lastReply()).toMatchObject({ projectPath: mockRoots[1], scopePath: mockRoots[1], complete: true, requestId: 2 })
  handle(MESSAGE_CMD.SAVE_CONFIG, { keyword: 'saved' }, w)
  expect(writeLocalConfigFile).toHaveBeenCalledWith({ keyword: 'saved' }, mockRoots[1])
  await handle(MESSAGE_CMD.RESOLVE_GALLERY_ENTRY, { targetPath: priorityPath }, w)
  expect(lastReply()).toMatchObject({ entry: { rootPath: mockRoots[1], kind: 'image' }, image: { fullPath: priorityPath } })
  await handle(MESSAGE_CMD.RESOLVE_GALLERY_ENTRY, { targetPath: path.join(mockRoots[0], 'assets/a.jpg') }, w)
  expect(lastReply()).toMatchObject({ error: expect.stringContaining('outside') })
})
test('a superseded root scan cannot publish its early snapshot or final callback', async () => {
  const w = panel()
  let finish: (_images: any[]) => void
  scan.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve }))
  const old = handle(MESSAGE_CMD.GET_ALL_IMGS, { projectRoot: mockRoots[0], requestId: 1 }, w)
  await Promise.resolve()
  await handle(MESSAGE_CMD.GET_ALL_IMGS, { projectRoot: mockRoots[0], requestId: 2 }, w)
  expect(scan.mock.calls[0][2].cancelled).toBe(true)
  scan.mock.calls[0][3].onFirstImages([])
  expect(w.postMessage).not.toHaveBeenCalled()
  finish([])
  await old
  expect(callbacks.mock.calls.filter((call) => call[2].requestId === 1)).toHaveLength(0)
})

test('the command adapter serializes only encoded paths, including Explorer multiselection arguments', () => {
  const target = path.join(mockRoots[0], 'assets/<', 'script><script>alert(1)<', 'script>', 'a.jpg')
  const args = [{ fsPath: target }, [{ fsPath: target }]]
  const key = gallery.webviewProps.multiPanel.instanceKeyFromCommandArgs(args, mockRoots[0])
  expect(key).toBe(mockRoots[0])
  expect(args).toHaveLength(1)
  expect(JSON.stringify(args)).not.toContain('<')
  expect(JSON.stringify(args)).not.toContain('</script>')
})

test('a webview message cannot choose a root before the host binds the panel', () => {
  expect(() => handle(MESSAGE_CMD.GET_CONFIG, { projectRoot: mockRoots[0] }, { postMessage: jest.fn() }))
    .toThrow('no longer open')
})

test('dimensions cannot read a different workspace folder or an escaping symlink', async () => {
  const w = panel(mockRoots[1])
  await expect(handle(MESSAGE_CMD.GET_IMAGE_SIZE, { filePath: path.join(mockRoots[0], 'assets/a.jpg') }, w)).rejects.toThrow('outside')
  fs.symlinkSync(path.join(mockRoots[0], 'assets/a.jpg'), path.join(mockRoots[1], 'linked.jpg'))
  await expect(handle(MESSAGE_CMD.GET_IMAGE_SIZE, { filePath: path.join(mockRoots[1], 'linked.jpg') }, w)).rejects.toThrow('outside')
})
