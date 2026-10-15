import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import * as vscode from 'vscode'
import { registerCustomImageEditor } from './customImageEditor'
import { MESSAGE_CMD } from './constants'
import { resolveFilmstripThumbnail } from './webviewController/imagesViewer/thumbGridCache'

jest.mock('./webviewController/imagesViewer/thumbGridCache', () => ({
  resolveFilmstripThumbnail: jest.fn(async () => ({ kind: 'thumb', cacheFsPath: '/cache/200.jpg' })),
  cacheFsPathToThumbResourceUri: (path) => ({ path })
}))

jest.mock('vscode', () => {
  const path = require('path')
  const file = (fsPath: string) => ({ scheme: 'file', fsPath, path: fsPath, toString: () => `file://${fsPath}` })
  return { Uri: { file, parse: (value) => file(value.slice('file://'.length)), joinPath: (base, ...segments) => file(path.join(base.fsPath, ...segments)) },
    FileType: { Directory: 2, File: 1 }, env: { language: 'en' },
    commands: { registerCommand: jest.fn(() => ({ dispose() {} })) },
    window: { registerCustomEditorProvider: jest.fn(() => ({ dispose() {} })) },
    workspace: { fs: { readDirectory: jest.fn(async () => [['current.jpg', 1], ['sibling.png', 1], ['notes.txt', 1], ['nested', 2]]) },
      getConfiguration: () => ({ get: (_key, fallback) => fallback }) } }
}, { virtual: true })

test('external single-image viewing keeps sibling navigation, narrow roots, safe HTML and close action', async () => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'single-security-'))
  fs.mkdirSync(path.join(temporary, 'distWebview'))
  fs.writeFileSync(path.join(temporary, 'distWebview/single.html'),
    '<html><head><script>window.currentView="$currentView$";window.vscodeEnv=$vscodeEnv$;window.commandArgs=$commandArgs$</script><script src="/single.js"></script></head></html>')
  try {
    const context = { extensionPath: temporary, extensionUri: vscode.Uri.file(temporary), globalStorageUri: vscode.Uri.file(path.join(temporary, 'storage')), subscriptions: [] } as any
    registerCustomImageEditor(context)
    const provider = (vscode.window.registerCustomEditorProvider as jest.Mock).mock.calls[0][1]
    const webview = { options: {}, cspSource: 'https://local.invalid', html: '',
      asWebviewUri: (uri) => ({ toString: () => `https://local.invalid${uri.path}` }),
      onDidReceiveMessage: jest.fn((_handler: unknown) => ({ dispose: jest.fn() })) }
    const panel = { webview, dispose: jest.fn(), onDidDispose: jest.fn() }
    const document = provider.openCustomDocument(vscode.Uri.file('/external/images/current.jpg'))
    await provider.resolveCustomEditor(document, panel)
    expect((webview.options as any).localResourceRoots.map((uri) => uri.path))
      .toEqual([path.join(temporary, 'distWebview'), '/external/images', path.join(temporary, 'storage/image-viewer-grid-thumbs')])
    expect((webview.options as any).enableCommandUris).toBe(false)
    const bootstrap = JSON.parse(/window.commandArgs=(.*?)<\/script>/.exec(webview.html)[1])[0]
    expect(bootstrap.images.map((image) => image.name)).toEqual(['current.jpg', 'sibling.png'])
    expect(webview.html).toContain("script-src 'nonce-")
    expect(webview.html).not.toContain('unsafe-eval')
    expect(webview.html).toContain(`https://local.invalid${temporary}/distWebview/single.js`)
    const receive = webview.onDidReceiveMessage.mock.calls[0][0] as any
    receive({ cmd: 'executeChildProcess', data: { command: 'sentinel' } })
    expect(panel.dispose).not.toHaveBeenCalled()
    receive({ cmd: MESSAGE_CMD.CLOSE_CUSTOM_IMAGE_EDITOR })
    expect(panel.dispose).toHaveBeenCalledTimes(1)
  } finally { fs.rmSync(temporary, { recursive: true, force: true }) }
})


test('single-image thumbnails authorize direct session members outside the workspace and reject escapes', async () => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'single-filmstrip-'))
  fs.mkdirSync(path.join(temporary, 'distWebview'))
  fs.writeFileSync(path.join(temporary, 'distWebview/single.html'), '<script>window.commandArgs=$commandArgs$</script>')
  const folder = path.join(temporary, 'images')
  fs.mkdirSync(folder)
  fs.writeFileSync(path.join(folder, 'current.jpg'), 'current')
  fs.writeFileSync(path.join(folder, 'sibling.png'), 'sibling')
  fs.writeFileSync(path.join(temporary, 'outside.png'), 'outside')
  fs.symlinkSync(path.join(temporary, 'outside.png'), path.join(folder, 'escaped.png'))
  ;(vscode.workspace.fs.readDirectory as jest.Mock).mockResolvedValueOnce([
    ['current.jpg', 1], ['sibling.png', 1], ['escaped.png', 1], ['nested', 2]
  ])
  try {
    const context = { extensionPath: temporary, extensionUri: vscode.Uri.file(temporary), globalStorageUri: vscode.Uri.file(path.join(temporary, 'storage')), subscriptions: [] } as any
    registerCustomImageEditor(context)
    const registrations = (vscode.window.registerCustomEditorProvider as jest.Mock).mock.calls
    const provider = registrations[registrations.length - 1][1]
    const webview = { options: {}, cspSource: 'https://local.invalid', html: '', postMessage: jest.fn(async () => true),
      asWebviewUri: (uri) => ({ toString: () => `https://local.invalid${uri.path}` }),
      onDidReceiveMessage: jest.fn((_handler: unknown) => ({ dispose() {} })) }
    const panel = { webview, dispose: jest.fn(), onDidDispose: jest.fn() }
    await provider.resolveCustomEditor(provider.openCustomDocument(vscode.Uri.file(path.join(folder, 'current.jpg'))), panel)
    const receive = webview.onDidReceiveMessage.mock.calls[0][0] as any
    const native = resolveFilmstripThumbnail as jest.Mock
    native.mockClear()
    await receive({ cmd: MESSAGE_CMD.GET_FILMSTRIP_THUMBNAIL, callbackId: 'allowed', data: { id: `file://${folder}/sibling.png` } })
    expect(native).toHaveBeenCalledWith(fs.realpathSync(path.join(folder, 'sibling.png')))
    expect(JSON.stringify(webview.postMessage.mock.calls)).toContain('https://local.invalid/cache/200.jpg')
    native.mockClear()
    for (const id of [`file://${folder}/nested/a.jpg`, `file://${folder}/escaped.png`, `file://${temporary}/outside.png`]) {
      await receive({ cmd: MESSAGE_CMD.GET_FILMSTRIP_THUMBNAIL, callbackId: 'denied', data: { id } })
    }
    expect(native).not.toHaveBeenCalled()
    expect(JSON.stringify(webview.postMessage.mock.calls)).toContain('error')
  } finally { fs.rmSync(temporary, { recursive: true, force: true }) }
})
