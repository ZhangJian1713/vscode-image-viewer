import * as fs from 'fs'
import * as path from 'path'
import * as vscode from 'vscode'
import imagesViewer, { setImageViewerScope } from './imagesViewer'
import { commandArgToFsPath } from './imageViewerPanelScope'

const panels = new Map<string, vscode.WebviewPanel>()

function resourceHtml(context: vscode.ExtensionContext, htmlPath: string, webview: vscode.Webview): string {
  const resourcePath = context.asAbsolutePath(htmlPath)
  const directory = path.dirname(resourcePath)
  let html = fs.readFileSync(resourcePath, 'utf8')
  html = html.replace(/(<link.+?href="|<script.+?src="|<img.+?src=")(.+?)"/g, (_match, prefix, source) => {
    const relativeSource = source.startsWith('.') ? source : `.${source}`
    return `${prefix}${webview.asWebviewUri(vscode.Uri.file(path.resolve(directory, relativeSource))).toString()}"`
  })
  return html.replace(/__WEBVIEW_CSP_SOURCE__/g, webview.cspSource)
}

function scopeFromCommandArgs(args: unknown[], projectPath: string): string | null {
  const raw = commandArgToFsPath(args[0])
  if (!raw) return null
  try {
    const resolved = path.resolve(raw)
    const directory = fs.statSync(resolved).isDirectory() ? resolved : path.dirname(resolved)
    const workspaceRoot = path.resolve(projectPath)
    return directory === workspaceRoot || directory.startsWith(workspaceRoot + path.sep) ? directory : null
  } catch {
    return null
  }
}

/** Register this webview without the dependency's generic, privileged dispatcher. */
export function registerSecureImageViewer(context: vscode.ExtensionContext): void {
  const { webviewProps, messageHandlers } = imagesViewer
  const { command, panelParams, iconPath, multiPanel } = webviewProps
  const { viewType, title, showOptions, options } = panelParams
  context.subscriptions.push(vscode.commands.registerCommand(command, (...args: unknown[]) => {
    const projectPath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
    if (!projectPath) {
      void vscode.window.showInformationMessage('Please open any folder before executing this extension')
      return
    }
    const instanceKey = multiPanel?.instanceKeyFromCommandArgs(args, projectPath) ?? '__default__'
    const panelTitle = multiPanel?.resolvePanelTitle(args, projectPath, title) ?? title
    const scope = scopeFromCommandArgs(args, projectPath)
    let panel = panels.get(instanceKey)
    if (panel) {
      panel.reveal()
      panel.title = panelTitle
      setImageViewerScope(panel.webview, scope)
      void panel.webview.postMessage({ cmd: 'revealWebview', data: {} })
      return
    }
    const localResourceRoots = [context.extensionUri, context.globalStorageUri, ...(vscode.workspace.workspaceFolders?.map((folder) => folder.uri) ?? []), ...(options.localResourceRoots ?? [])]
    panel = vscode.window.createWebviewPanel(viewType, panelTitle, showOptions, { ...options, enableScripts: true, localResourceRoots })
    panel.iconPath = vscode.Uri.file(context.asAbsolutePath(iconPath || 'assets/logo.svg'))
    setImageViewerScope(panel.webview, scope)
    panel.webview.html = resourceHtml(context, webviewProps.htmlPath, panel.webview)
    panel.webview.onDidReceiveMessage((message: unknown) => {
      const commandName = (message as { cmd?: unknown }).cmd
      if (typeof commandName !== 'string') return
      const handler = messageHandlers.get(commandName)
      if (handler) handler(message as never, panel!.webview)
    }, undefined, context.subscriptions)
    panels.set(instanceKey, panel)
    panel.onDidDispose(() => { panels.delete(instanceKey); panel = undefined }, undefined, context.subscriptions)
  }))
}
