import { exec } from 'child_process'
import { ViewColumn, Webview } from 'vscode'
import { utils, webviewUtils } from '@easy_vscode/core'
import { IWebview, IWebviewProps, IMessage } from '@easy_vscode/core/lib/types'
import { DIST_WEBVIEW_INDEX_HTML, EXTENSION_COMMANDS, MESSAGE_CMD, WEBVIEW_NAMES } from '../../constants'
import { getAllImgs, getImageBase64, getImageSize } from './utils'
import { readLocalConfigFile, writeLocalConfigFile } from './config'

const { deleteFile, getProjectPath, renameFile } = utils
const { invokeCallback, successResp } = webviewUtils

const viewType = WEBVIEW_NAMES.PreviewImages
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
  iconPath: 'assets/logo.png'
}

const messageHandlers = new Map([
  [
    MESSAGE_CMD.GET_ALL_IMGS,
    (message: IMessage, webview: Webview) => {
      const imgs = getAllImgs(webview)
      invokeCallback(viewType, message, { imgs, projectPath: getProjectPath() })
    }
  ],
  [
    MESSAGE_CMD.RENAME_FILE,
    (message: IMessage) => {
      renameFile(message.data.filePath, message.data.newName)
      invokeCallback(viewType, message, successResp)
    }
  ],
  [
    MESSAGE_CMD.DELETE_FILE,
    (message: IMessage) => {
      deleteFile(message.data.filePath)
      invokeCallback(viewType, message, successResp)
    }
  ],
  [
    MESSAGE_CMD.OPEN_IMAGE_DIRECTORY,
    (message: IMessage) => {
      exec(`open ${getProjectPath()}/${message.data.path}`)
    }
  ],
  [
    MESSAGE_CMD.GET_IMAGE_BASE64,
    (message: IMessage) => {
      const strBase64 = getImageBase64(message.data.filePath)
      invokeCallback(viewType, message, strBase64)
    }
  ],
  [
    MESSAGE_CMD.GET_IMAGE_SIZE,
    (message: IMessage) => {
      const dimensions = getImageSize(message.data.filePath)
      invokeCallback(viewType, message, dimensions)
    }
  ],
  [
    MESSAGE_CMD.SAVE_CONFIG,
    (message: IMessage) => {
      writeLocalConfigFile(message.data)
      invokeCallback(viewType, message, successResp)
    }
  ],
  [
    MESSAGE_CMD.GET_CONFIG,
    (message: IMessage) => invokeCallback(viewType, message, readLocalConfigFile())
  ],
])

const webview: IWebview = { webviewProps, messageHandlers }
export default webview
