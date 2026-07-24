import * as vscode from 'vscode'
import { registryAllWebviews } from './webviewController'
import { initGridThumbGlobalStorage } from './webviewController/imagesViewer/thumbGridCache'
import { initImageViewerConfigStorage } from './webviewController/imagesViewer/config'

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
  // Use the console to output diagnostic information (console.log) and errors (console.error)
  // This line of code will only be executed once when your extension is activated
  console.log('Congratulations, your extension "Image Viewer" is now active!')
  initGridThumbGlobalStorage(context)
  initImageViewerConfigStorage(context)
  registryAllWebviews(context)
}

// this method is called when your extension is deactivated
export function deactivate() {}
