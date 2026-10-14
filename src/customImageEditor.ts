import * as fs from 'fs'
import * as path from 'path'
import * as vscode from 'vscode'
import { hostText, languageRequest, trackLanguageWebview } from './i18n/languageHost'
import { webviewUtils } from '@easy_vscode/core'
import {
  DIST_WEBVIEW_PATH,
  DIST_WEBVIEW_SINGLE_INDEX_HTML,
  EXTENSION_COMMANDS,
  IMAGE_EDITOR_VIEW_TYPE,
  IMAGE_FILE_PATTERNS,
  MESSAGE_CMD,
  WEBVIEW_NAMES
} from './constants'
import {
  compareExplorerImageEntries,
  ExplorerImageSortEntry,
  ExplorerLexicographicOptions,
  ExplorerSortOrder
} from './explorerImageSort'

class ImageViewerDocument implements vscode.CustomDocument {
  public readonly uri: vscode.Uri

  constructor(uri: vscode.Uri) {
    this.uri = uri
  }

  dispose() {}
}

type SingleImageViewerBootstrap = {
  images: Array<{
    id: string
    src: string
    name: string
  }>
  currentIndex: number
}

type SiblingImageEntry = ExplorerImageSortEntry & {
  uri: vscode.Uri
}

const supportedImageExtensions = new Set(
  IMAGE_FILE_PATTERNS.map((pattern) => pattern.replace(/^\*/, '').toLowerCase())
)

function isSupportedImageName(name: string): boolean {
  return supportedImageExtensions.has(path.extname(name).toLowerCase())
}

function documentFolderUri(documentUri: vscode.Uri): vscode.Uri {
  return vscode.Uri.joinPath(documentUri, '..')
}

function getExplorerSortSettings(): {
  sortOrder: ExplorerSortOrder
  lexicographicOptions: ExplorerLexicographicOptions
  reverse: boolean
} {
  // Explorer sort settings are window-scoped in VS Code, not resource-scoped.
  const config = vscode.workspace.getConfiguration('explorer')
  return {
    sortOrder: config.get<ExplorerSortOrder>('sortOrder', 'default'),
    lexicographicOptions: config.get<ExplorerLexicographicOptions>(
      'sortOrderLexicographicOptions',
      'default'
    ),
    reverse: config.get<boolean>('sortOrderReverse', false)
  }
}

async function addModifiedTimes(entries: SiblingImageEntry[]): Promise<void> {
  // Metadata is only needed for explorer.sortOrder=modified. Keep the default path cheap,
  // and bound provider pressure for folders containing thousands of images.
  const batchSize = 16
  for (let start = 0; start < entries.length; start += batchSize) {
    const batch = entries.slice(start, start + batchSize)
    await Promise.all(
      batch.map(async (entry) => {
        try {
          entry.mtime = (await vscode.workspace.fs.stat(entry.uri)).mtime
        } catch {
          entry.mtime = 0
        }
      })
    )
  }
}

async function createSingleImageBootstrap(
  webview: vscode.Webview,
  documentUri: vscode.Uri
): Promise<SingleImageViewerBootstrap> {
  const folderUri = documentFolderUri(documentUri)
  const currentName = path.posix.basename(documentUri.path)
  let entries: SiblingImageEntry[] = []

  try {
    const directoryEntries = await vscode.workspace.fs.readDirectory(folderUri)
    entries = directoryEntries
      .filter(
        ([name, type]) =>
          (type & vscode.FileType.Directory) === 0 && isSupportedImageName(name)
      )
      .map(([name]) => ({ name, uri: vscode.Uri.joinPath(folderUri, name) }))
  } catch {
    // The current document is already authorized/openable. Directory enumeration can still fail
    // for a provider, so retain a fully functional single-image fallback.
  }

  if (!entries.some((entry) => entry.name === currentName)) {
    entries.push({ name: currentName, uri: documentUri })
  }

  const sortSettings = getExplorerSortSettings()
  if (sortSettings.sortOrder === 'modified') {
    await addModifiedTimes(entries)
  }
  entries.sort((one, other) => compareExplorerImageEntries(one, other, sortSettings))

  const currentIndex = Math.max(
    entries.findIndex((entry) => entry.name === currentName),
    0
  )
  return {
    images: entries.map((entry) => ({
      id: entry.uri.toString(),
      src: webview.asWebviewUri(entry.uri).toString(),
      name: entry.name
    })),
    currentIndex
  }
}

const { serializeForInlineScript, secureWebviewHtml } = webviewUtils

function createCustomEditorHtml(
  context: vscode.ExtensionContext,
  webview: vscode.Webview,
  bootstrap: SingleImageViewerBootstrap
): string {
  const htmlPath = path.join(context.extensionPath, DIST_WEBVIEW_SINGLE_INDEX_HTML)

  let html = fs.readFileSync(htmlPath, 'utf8')
  html = html
    .replace('$currentView$', () => WEBVIEW_NAMES.SingleImageViewer)
    .replace('$vscodeEnv$', () => serializeForInlineScript({ language: vscode.env.language }))
    .replace('$commandArgs$', () => serializeForInlineScript([bootstrap]))

  return secureWebviewHtml(html.replace(
    /\b(src|href)=(["'])\/([^"']+)\2/g,
    (_match, attribute: string, quote: string, assetPath: string) => {
      const assetUri = webview.asWebviewUri(
        vscode.Uri.joinPath(context.extensionUri, DIST_WEBVIEW_PATH, assetPath)
      )
      return `${attribute}=${quote}${assetUri.toString()}${quote}`
    }
  ), webview)
}

class ImageViewerEditorProvider implements vscode.CustomReadonlyEditorProvider<ImageViewerDocument> {
  private readonly context: vscode.ExtensionContext

  constructor(context: vscode.ExtensionContext) {
    this.context = context
  }

  openCustomDocument(uri: vscode.Uri): ImageViewerDocument {
    return new ImageViewerDocument(uri)
  }

  async resolveCustomEditor(
    document: ImageViewerDocument,
    webviewPanel: vscode.WebviewPanel
  ): Promise<void> {
    const distRoot = vscode.Uri.joinPath(this.context.extensionUri, DIST_WEBVIEW_PATH)
    const documentFolder = documentFolderUri(document.uri)

    webviewPanel.webview.options = {
      enableScripts: true,
      enableCommandUris: false,
      localResourceRoots: [distRoot, documentFolder]
    }

    let disposed = false
    const languageSubscription = trackLanguageWebview(webviewPanel.webview)
    const messageSubscription = webviewPanel.webview.onDidReceiveMessage(async (message) => {
      if (message?.cmd === MESSAGE_CMD.CLOSE_CUSTOM_IMAGE_EDITOR) {
        webviewPanel.dispose()
      } else if (message?.cmd === MESSAGE_CMD.GET_UI_LANGUAGE || message?.cmd === MESSAGE_CMD.SET_UI_LANGUAGE) {
        const result = await languageRequest(message.cmd, message.data?.preference)
        if (!disposed) {
          webviewUtils.invokeCallback(WEBVIEW_NAMES.SingleImageViewer, message, result, webviewPanel.webview)
        }
      }
    })
    webviewPanel.onDidDispose(() => {
      disposed = true
      messageSubscription.dispose()
      languageSubscription.dispose()
    })

    const bootstrap = await createSingleImageBootstrap(webviewPanel.webview, document.uri)
    if (disposed) {
      return
    }
    webviewPanel.webview.html = createCustomEditorHtml(
      this.context,
      webviewPanel.webview,
      bootstrap
    )
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
  void vscode.window.showInformationMessage(
    hostText('host.defaultSet')
  )
}

async function restoreBuiltInImageViewer(): Promise<void> {
  const current = readGlobalEditorAssociations()
  const next = { ...current }
  for (const pattern of IMAGE_FILE_PATTERNS) {
    if (next[pattern] === IMAGE_EDITOR_VIEW_TYPE) {
      delete next[pattern]
    }
  }
  await writeGlobalEditorAssociations(next)
  void vscode.window.showInformationMessage(
    hostText('host.defaultRestored')
  )
}

export function registerCustomImageEditor(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.window.registerCustomEditorProvider(
      IMAGE_EDITOR_VIEW_TYPE,
      new ImageViewerEditorProvider(context),
      {
        webviewOptions: { retainContextWhenHidden: true },
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
