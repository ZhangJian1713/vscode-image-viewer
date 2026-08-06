import * as fs from 'fs'
import * as path from 'path'
import * as vscode from 'vscode'
import {
  DIST_WEBVIEW_INDEX_HTML,
  DIST_WEBVIEW_PATH,
  EXTENSION_COMMANDS,
  IMAGE_EDITOR_VIEW_TYPE,
  IMAGE_FILE_PATTERNS,
  MESSAGE_CMD,
  WEBVIEW_NAMES
} from './constants'

class ImageViewerDocument implements vscode.CustomDocument {
  constructor(public readonly uri: vscode.Uri) {}

  dispose() {}
}

type SingleImageViewerBootstrap = {
  src: string
  name: string
}

function serializeForInlineScript(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029')
}

function createCustomEditorHtml(
  context: vscode.ExtensionContext,
  webview: vscode.Webview,
  documentUri: vscode.Uri
): string {
  const htmlPath = path.join(context.extensionPath, DIST_WEBVIEW_INDEX_HTML)
  const image: SingleImageViewerBootstrap = {
    src: webview.asWebviewUri(documentUri).toString(),
    name: path.basename(documentUri.fsPath)
  }

  let html = fs.readFileSync(htmlPath, 'utf8')
  html = html
    .replace('$currentView$', () => WEBVIEW_NAMES.SingleImageViewer)
    .replace('$vscodeEnv$', () => serializeForInlineScript({ language: vscode.env.language }))
    .replace('$commandArgs$', () => serializeForInlineScript([image]))

  return html.replace(
    /\b(src|href)=(["'])\/([^"']+)\2/g,
    (_match, attribute: string, quote: string, assetPath: string) => {
      const assetUri = webview.asWebviewUri(
        vscode.Uri.joinPath(context.extensionUri, DIST_WEBVIEW_PATH, assetPath)
      )
      return `${attribute}=${quote}${assetUri.toString()}${quote}`
    }
  )
}

class ImageViewerEditorProvider implements vscode.CustomReadonlyEditorProvider<ImageViewerDocument> {
  constructor(private readonly context: vscode.ExtensionContext) {}

  openCustomDocument(uri: vscode.Uri): ImageViewerDocument {
    return new ImageViewerDocument(uri)
  }

  resolveCustomEditor(
    document: ImageViewerDocument,
    webviewPanel: vscode.WebviewPanel
  ): void {
    const distRoot = vscode.Uri.joinPath(this.context.extensionUri, DIST_WEBVIEW_PATH)
    const documentFolder = vscode.Uri.joinPath(document.uri, '..')

    webviewPanel.webview.options = {
      enableScripts: true,
      localResourceRoots: [distRoot, documentFolder]
    }
    webviewPanel.webview.html = createCustomEditorHtml(
      this.context,
      webviewPanel.webview,
      document.uri
    )

    const messageSubscription = webviewPanel.webview.onDidReceiveMessage((message) => {
      if (message?.cmd === MESSAGE_CMD.CLOSE_CUSTOM_IMAGE_EDITOR) {
        webviewPanel.dispose()
      }
    })
    webviewPanel.onDidDispose(() => messageSubscription.dispose())
  }
}

type EditorAssociations = Record<string, string>

function readGlobalEditorAssociations(): EditorAssociations {
  return vscode.workspace
    .getConfiguration('workbench')
    .inspect<EditorAssociations>('editorAssociations')
    ?.globalValue ?? {}
}

async function writeGlobalEditorAssociations(value: EditorAssociations): Promise<void> {
  await vscode.workspace
    .getConfiguration('workbench')
    .update('editorAssociations', value, vscode.ConfigurationTarget.Global)
}

async function setAsDefaultImageViewer(): Promise<void> {
  const current = readGlobalEditorAssociations()
  const next = { ...current }
  for (const pattern of IMAGE_FILE_PATTERNS) {
    next[pattern] = IMAGE_EDITOR_VIEW_TYPE
  }
  await writeGlobalEditorAssociations(next)
  void vscode.window.showInformationMessage('Image Viewer is now the default editor for supported images.')
}

async function restoreBuiltInImageViewer(): Promise<void> {
  const current = readGlobalEditorAssociations()
  const next: EditorAssociations = {}
  for (const [pattern, editor] of Object.entries(current)) {
    if (editor !== IMAGE_EDITOR_VIEW_TYPE) {
      next[pattern] = editor
    }
  }
  await writeGlobalEditorAssociations(next)
  void vscode.window.showInformationMessage("VS Code's built-in image editor is restored as the default.")
}

export function registerCustomImageEditor(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.window.registerCustomEditorProvider(
      IMAGE_EDITOR_VIEW_TYPE,
      new ImageViewerEditorProvider(context),
      {
        webviewOptions: { retainContextWhenHidden: false },
        supportsMultipleEditorsPerDocument: false
      }
    ),
    vscode.commands.registerCommand(
      EXTENSION_COMMANDS.SET_AS_DEFAULT_IMAGE_VIEWER,
      setAsDefaultImageViewer
    ),
    vscode.commands.registerCommand(
      EXTENSION_COMMANDS.RESTORE_BUILT_IN_IMAGE_VIEWER,
      restoreBuiltInImageViewer
    )
  )
}
