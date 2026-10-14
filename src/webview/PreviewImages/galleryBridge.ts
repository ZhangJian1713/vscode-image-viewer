import { callVscode } from '@easy_vscode/webview'

export interface GalleryMessage {
  cmd: string
  data?: unknown
}

/* eslint-disable no-unused-vars -- callback signatures */
export type GalleryTransport = (message: GalleryMessage, callback?: (value: any) => void) => void
/* eslint-enable no-unused-vars */

/** Browser mock is explicit and injected by the development entry; production still uses the existing RPC. */
export const callGalleryHost: GalleryTransport = (message, callback) => {
  const mock = (window as Window & { imageViewerMockTransport?: GalleryTransport }).imageViewerMockTransport
  if (process.env.NODE_ENV === 'development' && mock) {
    mock(message, callback)
  } else {
    callVscode(message, callback)
  }
}
