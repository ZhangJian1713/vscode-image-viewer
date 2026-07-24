import { ExtensionContext } from 'vscode'
import { registerSecureImageViewer } from './secureImageViewerRegistry'

export const registryAllWebviews = function (context: ExtensionContext) {
  registerSecureImageViewer(context)
}
