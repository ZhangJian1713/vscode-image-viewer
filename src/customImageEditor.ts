import * as vscode from 'vscode'
import { EXTENSION_COMMANDS, IMAGE_EDITOR_VIEW_TYPE, IMAGE_FILE_PATTERNS } from './constants'

class ImageViewerDocument implements vscode.CustomDocument {
  constructor(public readonly uri: vscode.Uri) {}

  dispose() {}
}

class ImageViewerEditorProvider implements vscode.CustomReadonlyEditorProvider<ImageViewerDocument> {
  async openCustomDocument(uri: vscode.Uri): Promise<ImageViewerDocument> {
    return new ImageViewerDocument(uri)
  }

  async resolveCustomEditor(
    document: ImageViewerDocument,
    webviewPanel: vscode.WebviewPanel
  ): Promise<void> {
    try {
      await vscode.commands.executeCommand(
        EXTENSION_COMMANDS.OPEN_WEBVIEW_IMAGE_VIEWER,
        document.uri
      )
    } finally {
      // The existing gallery owns the real viewer panel. Close the transient
      // custom-editor panel after the gallery has opened the selected image.
      webviewPanel.dispose()
    }
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
      new ImageViewerEditorProvider(),
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
