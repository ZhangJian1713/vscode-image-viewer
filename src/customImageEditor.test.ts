import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import * as vscode from 'vscode'
import { registerCustomImageEditor } from './customImageEditor'
import { MESSAGE_CMD } from './constants'

jest.mock('vscode', () => {
  const path = require('path')
  const file = (fsPath: string) => ({ fsPath, path: fsPath, toString: () => `file://${fsPath}` })
  return { Uri: { file, joinPath: (base, ...segments) => file(path.join(base.fsPath, ...segments)) },
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
    const context = { extensionPath: temporary, extensionUri: vscode.Uri.file(temporary), subscriptions: [] } as any
    registerCustomImageEditor(context)
    const provider = (vscode.window.registerCustomEditorProvider as jest.Mock).mock.calls[0][1]
    const webview = { options: {}, cspSource: 'https://local.invalid', html: '',
      asWebviewUri: (uri) => ({ toString: () => `https://local.invalid${uri.path}` }),
      onDidReceiveMessage: jest.fn((_handler: unknown) => ({ dispose: jest.fn() })) }
    const panel = { webview, dispose: jest.fn(), onDidDispose: jest.fn() }
    const document = provider.openCustomDocument(vscode.Uri.file('/external/images/current.jpg'))
    await provider.resolveCustomEditor(document, panel)
    expect((webview.options as any).localResourceRoots.map((uri) => uri.path))
      .toEqual([path.join(temporary, 'distWebview'), '/external/images'])
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
