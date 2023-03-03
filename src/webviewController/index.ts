import { ExtensionContext } from 'vscode'
import imagesViewer from './imagesViewer'
import { webviewUtils } from '@easy_vscode/core'

const {registryWebview} = webviewUtils

export const registryAllWebviews = function (context: ExtensionContext) {
  registryWebview(context, imagesViewer)
}
