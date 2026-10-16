import { filmstripPreference, filmstripThumbnail } from '../../filmstripHost'
import { toggleWindowFullscreen } from '../../windowFullscreen'
import * as path from 'path'
import { assertProjectResource } from './projectResource'
import { feedbackUrl } from '../../feedback'
import { Uri, ViewColumn, Webview, commands, workspace, env as vscodeEnv, window as vscodeWindow } from 'vscode'
import { webviewUtils } from '@easy_vscode/core'
import { IWebview, IWebviewProps, IMessage } from '@easy_vscode/core/lib/types'
import { DIST_WEBVIEW_INDEX_HTML, DIST_WEBVIEW_PATH, EXTENSION_COMMANDS, MESSAGE_CMD, WEBVIEW_NAMES } from '../../constants'
import { getAllImgs, getImageBase64, getImageSize } from './utils'
import { GRID_THUMB_GLOBAL_SUBDIR, normalizeThumbTierEdge } from '../../config/gridThumb'
import { resolveThumbForGrid, cacheFsPathToThumbResourceUri } from './thumbGridCache'
import { readLocalConfigFile, writeLocalConfigFile } from './config'
import { createGalleryEntry, imageViewerPanelInstanceKey, imageViewerPanelTitle } from '../imageViewerPanelScope'
import { GalleryScanResult, galleryEntryToArg, galleryEntryFromArg } from '../../galleryEntry'
import { hostText, languageRequest, trackLanguageWebview } from '../../i18n/languageHost'
import { createGalleryFileWatcher } from './galleryFileWatcher'
import { previewPreferencesRequest, trackPreviewPreferences } from '../../previewPreferencesHost'

/** Webview payload returned by `GET_THUMB_FOR_GRID`. */
export type GridThumbWirePayload = { kind: 'thumb'; thumbSrc: string } | { kind: 'original' }

const { invokeCallback, successResp } = webviewUtils

const viewType = WEBVIEW_NAMES.PreviewImages
const scanRequests = new WeakMap<Webview, { cancelled: boolean }>()
const panelRoots = new WeakMap<Webview, string>()
const panelWatchers = new WeakMap<Webview, ReturnType<typeof createGalleryFileWatcher>>()

/** Bind once: panel messages cannot change to a different workspace root. */
function panelRoot(webview: Webview): string {
  const root = panelRoots.get(webview)
  if (!root || !workspace.workspaceFolders?.some((folder) => path.resolve(folder.uri.fsPath) === root)) {
    throw new Error('The gallery workspace folder is no longer open.')
  }
  return root
}
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
  resolvePanelOptions: (args, _projectPath, context) => {
    const entry = galleryEntryFromArg(args[0])
    if (!entry) { throw new Error('A host-resolved gallery entry is required.') }
    return { localResourceRoots: [Uri.joinPath(context.extensionUri, DIST_WEBVIEW_PATH),
      Uri.joinPath(context.globalStorageUri, GRID_THUMB_GLOBAL_SUBDIR), Uri.file(entry.rootPath)] }
  },
  onDidCreatePanel: (panel, args) => {
    const entry = galleryEntryFromArg(args[0])
    if (!entry) { throw new Error('A host-resolved gallery entry is required.') }
    panelRoots.set(panel.webview, path.resolve(entry.rootPath))
    const fileWatcher = createGalleryFileWatcher(panel, path.resolve(entry.rootPath))
    panelWatchers.set(panel.webview, fileWatcher)
    const languageSubscription = trackLanguageWebview(panel.webview)
    const previewSubscription = trackPreviewPreferences(panel.webview)
    return { dispose: () => {
      languageSubscription.dispose()
      previewSubscription.dispose()
      fileWatcher.dispose()
      panelWatchers.delete(panel.webview)
      const scan = scanRequests.get(panel.webview)
      if (scan) { scan.cancelled = true }
      scanRequests.delete(panel.webview)
      panelRoots.delete(panel.webview)
    } }
  },
  multiPanel: {
    instanceKeyFromCommandArgs: (args, projectPath) => {
      // Adapt before the registry serializes commandArgs or posts a reveal message.
      const entry = createGalleryEntry(args[0], projectPath, workspace.workspaceFolders?.map((folder) => folder.uri.fsPath))
      // Explorer can also supply a multiselection array. Only the clicked entry is used;
      // do not leave unused raw paths in the HTML commandArgs script.
      args.splice(0, args.length, galleryEntryToArg(entry))
      return imageViewerPanelInstanceKey(args, projectPath)
    },
    resolvePanelTitle: imageViewerPanelTitle
  }
}

const messageHandlers = new Map([
  ...[MESSAGE_CMD.GET_PREVIEW_PREFERENCES, MESSAGE_CMD.SET_PREVIEW_PREFERENCES].map((cmd) => [
    cmd, async (message: IMessage, webview: Webview) => {
      invokeCallback(viewType, message, await previewPreferencesRequest(cmd, message.data?.showMirrorButtons), webview)
    }
  ] as [string, (message: IMessage, webview: Webview) => Promise<void>]),
  [MESSAGE_CMD.GET_FILMSTRIP_THUMBNAIL, async (message: IMessage, webview: Webview) => {
    const result = await filmstripThumbnail(webview, message.data?.id,
      async (id) => {
        const { target } = await assertProjectResource(panelRoot(webview), id, true)
        return { filePath: target, sourceUri: Uri.file(id) }
      })
    invokeCallback(viewType, message, result, webview)
  }],
  ...[MESSAGE_CMD.GET_FILMSTRIP_STATE, MESSAGE_CMD.SET_FILMSTRIP_STATE].map((cmd) => [
    cmd, async (message: IMessage, webview: Webview) => {
      invokeCallback(viewType, message, await filmstripPreference('gallery', cmd, message.data?.visible), webview)
    }
  ] as [string, (message: IMessage, webview: Webview) => Promise<void>]),
  [MESSAGE_CMD.TOGGLE_WINDOW_FULLSCREEN, async (message: IMessage, webview: Webview) => {
    invokeCallback(viewType, message, await toggleWindowFullscreen(), webview)
  }],
  ...[MESSAGE_CMD.GET_UI_LANGUAGE, MESSAGE_CMD.SET_UI_LANGUAGE].map((cmd) => [
    cmd,
    async (message: IMessage, webview: Webview) => {
      const result = await languageRequest(cmd, message.data?.preference)
      invokeCallback(viewType, message, result, webview)
    }
  ] as [string, (message: IMessage, webview: Webview) => Promise<void>]),
  [
    MESSAGE_CMD.GET_ALL_IMGS,
    async (message: IMessage, webview: Webview) => {
      const { priorityPath, requestId } = message.data || {}
      let basePath = ''
      const previous = scanRequests.get(webview)
      if (previous) {
        previous.cancelled = true
      }
      const request = { cancelled: false }
      scanRequests.set(webview, request)
      const fileWatcher = panelWatchers.get(webview)
      const scanToken = fileWatcher?.beginScan(requestId)
      try {
        basePath = panelRoot(webview)
        const response = (imgs, complete): GalleryScanResult => ({ imgs, complete, requestId,
          projectPath: basePath, scopePath: basePath })
        const imgs = await getAllImgs(webview, null, request, { basePath, priorityPath,
          onFirstImages: (images) => {
            if (!request.cancelled) {
              void webview.postMessage({ cmd: MESSAGE_CMD.GALLERY_SCAN_PROGRESS, data: response(images, false) })
            }
          } })
        if (!request.cancelled) { invokeCallback(viewType, message, response(imgs, true), webview) }
      } catch (error) {
        if (request.cancelled) { return }
        invokeCallback(
          viewType,
          message,
          {
            imgs: [],
            projectPath: basePath,
            scopePath: basePath,
            requestId,
            complete: true,
            error: error instanceof Error ? error.message : String(error)
          },
          webview
        )
      } finally {
        if (scanToken) { fileWatcher.endScan(scanToken) }
      }
    }
  ],
  [
    MESSAGE_CMD.RESOLVE_GALLERY_ENTRY,
    async (message: IMessage, webview: Webview) => {
      try {
        const root = panelRoot(webview)
        const entry = createGalleryEntry(message.data?.targetPath, root, [root])
        let image
        if (entry.targetPath) {
          const resource = await assertProjectResource(root, entry.targetPath, entry.kind === 'image')
          if (entry.kind === 'image') {
            image = { path: '/' + path.relative(root, entry.targetPath).replace(/\\/g, '/'),
              fullPath: entry.targetPath, vscodePath: webview.asWebviewUri(Uri.file(entry.targetPath)).toString(),
              size: resource.stat.size, mtimeMs: resource.stat.mtimeMs }
          }
        }
        invokeCallback(viewType, message, { entry, image }, webview)
      } catch (error) {
        invokeCallback(viewType, message, { error: error instanceof Error ? error.message : String(error) }, webview)
      }
    }
  ],
  [
    MESSAGE_CMD.GALLERY_RESOURCE_ACTION,
    async (message: IMessage, webview: Webview) => {
      try {
        const { filePath, action } = message.data as { filePath: string; action: string }
        const { target, relative } = await assertProjectResource(panelRoot(webview), filePath,
          action === 'deleteFile' || action === 'copyBase64')
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
    async (message: IMessage, w: Webview) => {
      const { target } = await assertProjectResource(panelRoot(w), message.data?.filePath, true)
      const dimensions = getImageSize(target)
      invokeCallback(viewType, message, dimensions, w)
    }
  ],
  [
    MESSAGE_CMD.GET_THUMB_FOR_GRID,
    async (message: IMessage, panelWebview: Webview) => {
      const callbackId = message.callbackId
      const filePathIn = String(message.data?.filePath ?? '')
      const targetEdge = normalizeThumbTierEdge(Number(message.data?.targetMaxEdgePx))
      const reply = (payload: GridThumbWirePayload) => {
        invokeCallback(viewType, { ...message, callbackId } as IMessage, payload, panelWebview)
      }
      try {
        const { target } = await assertProjectResource(panelRoot(panelWebview), filePathIn, true)
        const res = await resolveThumbForGrid(target, targetEdge)
        if (res.kind === 'thumb') {
          const resourceUri = cacheFsPathToThumbResourceUri(res.cacheFsPath) ?? Uri.file(res.cacheFsPath)
          reply({
            kind: 'thumb',
            thumbSrc: panelWebview.asWebviewUri(resourceUri).toString()
          })
        } else {
          reply({ kind: 'original' })
        }
      } catch {
        reply({ kind: 'original' })
      }
    }
  ],
  [
    MESSAGE_CMD.SAVE_CONFIG,
    (message: IMessage, w: Webview) => {
      writeLocalConfigFile(message.data, panelRoot(w))
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
          ...readLocalConfigFile(panelRoot(w)),
          hostUiLanguage: vscodeEnv.language
        },
        w
      )
  ],
  [
    MESSAGE_CMD.OPEN_FEEDBACK,
    (message: IMessage) => {
      const version = require('../../../package.json').version as string
      return vscodeEnv.openExternal(Uri.parse(feedbackUrl(message.data?.action, version)))
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
          hostText('host.cacheFailed', { detail: data?.error || hostText('host.unknownError') })
        )
        return
      }
      const matched = Number(data.matchedCaches ?? 0)
      const deleted = Number(data.deletedCaches ?? 0)
      const failed = Number(data.failedCaches ?? 0)
      const suffix = failed > 0 ? ' ' + hostText('host.cachePartial', { failed }) : ''
      void vscodeWindow.showInformationMessage(
        (matched > 0 ? hostText('host.cacheCleaned', { deleted, matched }) : hostText('host.cacheNone')) + suffix
      )
    }
  ]
])

const webview: IWebview = { webviewProps, messageHandlers }
export default webview
