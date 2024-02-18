/* eslint-disable @typescript-eslint/naming-convention */

export const DIST_WEBVIEW_PATH = 'distWebview'
export const DIST_WEBVIEW_INDEX_HTML = `${DIST_WEBVIEW_PATH}/index.html`

export const WEBVIEW_NAMES = {
  PreviewImages: 'PreviewImages',
}

export const MESSAGE_CMD = {
  // image viewer
  GET_ALL_IMGS: 'getAllImgs',
  RENAME_FILE: 'renameFile',
  DELETE_FILE: 'deleteFile',
  OPEN_IMAGE_DIRECTORY: 'openImageDirectory',
  GET_IMAGE_BASE64: 'getImageBase64',
  GET_IMAGE_SIZE: 'getImageSize',
  SAVE_CONFIG: 'saveConfig',
  GET_CONFIG: 'getConfig',
}

export const EXTENSION_NAME = 'vscode-infra'

export const EXTENSION_COMMANDS = {
  OPEN_WEBVIEW_IMAGE_VIEWER: `${EXTENSION_NAME}.webviewImageViewer`,
}


export const BACKGROUND_COLOR_OPTIONS = [
  '#ffffff',
  '#cccccc',
  '#999999',
  '#333333',
  '#a89a89',
  '#a9e4af',
  '#f1a8a4',
  '#64bbe2',
  '#8488b6'
]

export const DEFAULT_BACKGROUND_COLOR = BACKGROUND_COLOR_OPTIONS[1]

export const DEFAULT_IMAGE_SIZE = 5