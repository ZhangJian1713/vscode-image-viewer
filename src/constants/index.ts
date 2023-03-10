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
}

export const EXTENSION_NAME = 'vscode-infra'

export const EXTENSION_COMMANDS = {
  OPEN_WEBVIEW_IMAGE_VIEWER: `${EXTENSION_NAME}.webviewImageViewer`,
}
