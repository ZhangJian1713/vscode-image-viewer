import * as fs from 'fs'
import * as path from 'path'
import { Uri, ViewColumn, Webview, commands, workspace, env as vscodeEnv, window as vscodeWindow } from 'vscode'
import { utils, webviewUtils } from '@easy_vscode/core'
import { IWebview, IWebviewProps, IMessage } from '@easy_vscode/core/lib/types'
import { DIST_WEBVIEW_INDEX_HTML, EXTENSION_COMMANDS, MESSAGE_CMD, WEBVIEW_NAMES } from '../../constants'
import { getAllImgs, getImageBase64, getImageSize, SUPPORT_IMG_TYPES } from './utils'
import { normalizeThumbTierEdge } from '../../config/gridThumb'
import { resolveThumbForGrid, cacheFsPathToThumbResourceUri } from './thumbGridCache'
import { readLocalConfigFile, writeLocalConfigFile } from './config'
import { imageViewerPanelInstanceKey, imageViewerPanelTitle } from '../imageViewerPanelScope'

/** Webview payload returned by `GET_THUMB_FOR_GRID`. */
export type GridThumbWirePayload = { kind: 'thumb'; thumbSrc: string } | { kind: 'original' }

const { getProjectPath } = utils
const { invokeCallback, successResp } = webviewUtils

const viewType = WEBVIEW_NAMES.PreviewImages
const scanRequests = new WeakMap<Webview, { cancelled: boolean }>()
const webviewProps: IWebviewProps = {
  command: EXTENSION_COMMANDS.OPEN_WEBVIEW_IMAGE_VIEWER,
  htmlPath: DIST_WEBVIEW_INDEX_HTML,
  currentView: viewType,
  panelParams: {
    viewType,
    title: 'Images Viewer',
    showOptions: ViewColumn.One,
    options: {
      enableScripts: true,
      retainContextWhenHidden: true
    }
  },
  iconPath: 'assets/logo.png',
  multiPanel: {
    instanceKeyFromCommandArgs: imageViewerPanelInstanceKey,
    resolvePanelTitle: imageViewerPanelTitle
  }
}

const messageHandlers = new Map([
  [
    MESSAGE_CMD.GET_ALL_IMGS,
    async (message: IMessage, webview: Webview) => {
      const basePath = path.resolve(getProjectPath())
      const hint = (message.data as { scopeHintFsPath?: string } | undefined)?.scopeHintFsPath
      let listScopeAbs: string | null = null
      if (hint && typeof hint === 'string') {
        const trimmed = hint.trim()
        if (trimmed.length > 0) {
          try {
            const resolved = path.resolve(trimmed)
            if (fs.existsSync(resolved)) {
              const st = fs.statSync(resolved)
              const folderAbs = st.isDirectory() ? resolved : path.dirname(resolved)
              const baseNorm = path.resolve(basePath)
              if (folderAbs === baseNorm || folderAbs.startsWith(baseNorm + path.sep)) {
                listScopeAbs = folderAbs
              }
            }
          } catch {
            //
          }
        }
      }
      const previous = scanRequests.get(webview)
      if (previous) {
        previous.cancelled = true
      }
      const request = { cancelled: false }
      scanRequests.set(webview, request)
      try {
        const imgs = await getAllImgs(webview, listScopeAbs, request)
        invokeCallback(viewType, message, { imgs, projectPath: basePath, scopePath: listScopeAbs || basePath }, webview)
      } catch (error) {
        invokeCallback(
          viewType,
          message,
          {
            imgs: [],
            projectPath: basePath,
            scopePath: listScopeAbs || basePath,
            error: error instanceof Error ? error.message : String(error)
          },
          webview
        )
      }
    }
  ],
  [
    MESSAGE_CMD.GALLERY_RESOURCE_ACTION,
    async (message: IMessage, webview: Webview) => {
      try {
        const { filePath, action } = message.data as { filePath: string; action: string }
        const root = await fs.promises.realpath(getProjectPath())
        const target = await fs.promises.realpath(path.resolve(filePath))
        const relative = path.relative(root, target)
        if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
          throw new Error('This resource is outside the current workspace.')
        }
        if (action === 'deleteFile' || action === 'copyBase64') {
          const stat = await fs.promises.stat(target)
          if (!stat.isFile() || !SUPPORT_IMG_TYPES.includes(path.extname(target).toLowerCase())) {
            throw new Error('This action requires a supported image file.')
          }
        }
        const uri = Uri.file(target)
        switch (action) {
          case 'copyFullPath':
            await vscodeEnv.clipboard.writeText(target)
            break
          case 'copyRelativePath':
            await vscodeEnv.clipboard.writeText(relative.replace(/\\/g, '/') || '.')
            break
          case 'copyName':
            await vscodeEnv.clipboard.writeText(path.basename(target))
            break
          case 'copyBase64':
            await vscodeEnv.clipboard.writeText(getImageBase64(target))
            break
          case 'revealInExplorer':
            await commands.executeCommand('revealInExplorer', uri)
            break
          case 'revealInFileManager':
            await commands.executeCommand('revealFileInOS', uri)
            break
          case 'deleteFile':
            await workspace.fs.delete(uri, { useTrash: true })
            break
          default:
            throw new Error('Unknown gallery action.')
        }
        invokeCallback(viewType, message, { ok: true }, webview)
      } catch (error) {
        invokeCallback(
          viewType,
          message,
          { ok: false, error: error instanceof Error ? error.message : String(error) },
          webview
        )
      }
    }
  ],
  [
    MESSAGE_CMD.GET_IMAGE_SIZE,
    (message: IMessage, w: Webview) => {
      const dimensions = getImageSize(message.data.filePath)
      invokeCallback(viewType, message, dimensions, w)
    }
  ],
  [
    MESSAGE_CMD.GET_THUMB_FOR_GRID,
    (message: IMessage, panelWebview: Webview) => {
      const callbackId = message.callbackId
      const filePathIn = String(message.data?.filePath ?? '')
      const targetEdge = normalizeThumbTierEdge(Number(message.data?.targetMaxEdgePx))
      const reply = (payload: GridThumbWirePayload) => {
        invokeCallback(viewType, { ...message, callbackId } as IMessage, payload, panelWebview)
      }
      void (async () => {
        try {
          const res = await resolveThumbForGrid(filePathIn, targetEdge)
          if (res.kind === 'thumb') {
            const resourceUri = cacheFsPathToThumbResourceUri(res.cacheFsPath) ?? Uri.file(res.cacheFsPath)
            reply({
              kind: 'thumb',
              thumbSrc: panelWebview.asWebviewUri(resourceUri).toString()
            })
          } else {
            reply({ kind: 'original' })
          }
        } catch (e) {
          console.error(e)
          reply({ kind: 'original' })
        }
      })()
    }
  ],
  [
    MESSAGE_CMD.SAVE_CONFIG,
    (message: IMessage, w: Webview) => {
      writeLocalConfigFile(message.data)
      invokeCallback(viewType, message, successResp, w)
    }
  ],
  [
    MESSAGE_CMD.GET_CONFIG,
    (message: IMessage, w: Webview) =>
      invokeCallback(
        viewType,
        message,
        {
          ...readLocalConfigFile(),
          hostUiLanguage: vscodeEnv.language
        },
        w
      )
  ],
  [
    MESSAGE_CMD.OPEN_EXTERNAL_URI,
    (message: IMessage) => {
      const raw = String((message.data as { url?: string } | undefined)?.url ?? '').trim()
      if (raw) {
        void vscodeEnv.openExternal(Uri.parse(raw))
      }
    }
  ],
  [
    MESSAGE_CMD.RESOURCE_CACHE_CLEANUP_RESULT,
    (message: IMessage) => {
      const data = message.data as {
        ok?: boolean
        matchedCaches?: number
        deletedCaches?: number
        failedCaches?: number
        error?: string
      }
      if (!data?.ok) {
        void vscodeWindow.showWarningMessage(
          `Image Viewer could not clean the WebView image cache: ${data?.error || 'unknown error'}`
        )
        return
      }
      const matched = Number(data.matchedCaches ?? 0)
      const deleted = Number(data.deletedCaches ?? 0)
      const failed = Number(data.failedCaches ?? 0)
      const suffix = failed > 0 ? ` ${failed} cache(s) could not be deleted.` : ''
      void vscodeWindow.showInformationMessage(
        matched > 0
          ? `Image Viewer cleaned ${deleted} of ${matched} gallery WebView resource cache(s).${suffix} Single-image editor caches are cleaned automatically when that editor is next opened.`
          : 'Image Viewer found no gallery WebView resource cache to clean. Single-image editor caches are cleaned automatically when that editor is next opened.'
      )
    }
  ]
])

const webview: IWebview = { webviewProps, messageHandlers }
export default webview
