import * as vscode from 'vscode'
import { utils } from '@easy_vscode/core'
import { registryAllWebviews } from './webviewController'
import * as path from 'path'

const {envVars} = utils

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
  // Use the console to output diagnostic information (console.log) and errors (console.error)
  // This line of code will only be executed once when your extension is activated
  console.log('Congratulations, your extension "Image Viewer" is now active!')
  envVars.extensionPath = path.join(context.extensionPath, './')
  registryAllWebviews(context)
}

// this method is called when your extension is deactivated
export function deactivate() {}
