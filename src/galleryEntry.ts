import type { RawWorkspaceImage } from './webview/PreviewImages/galleryModel'

export interface GalleryEntry {
  __imageViewerEntry: true
  rootPath: string
  targetPath: string
  kind: 'root' | 'folder' | 'file' | 'image'
  __imageViewerCleanResourceCache?: boolean
}

/** One wire shape shared by the command adapter and the WebView. */
export function galleryEntryFromArg(arg: unknown): GalleryEntry | undefined {
  if (!arg || typeof arg !== 'object') { return undefined }
  const encoded = arg as { __imageViewerEntry?: boolean; rootPathEncoded?: string; targetPathEncoded?: string;
    kind?: GalleryEntry['kind']; __imageViewerCleanResourceCache?: boolean }
  if (encoded.__imageViewerEntry && typeof encoded.rootPathEncoded === 'string' && typeof encoded.targetPathEncoded === 'string') {
    try {
      return galleryEntryFromArg({ __imageViewerEntry: true, rootPath: decodeURIComponent(encoded.rootPathEncoded),
        targetPath: decodeURIComponent(encoded.targetPathEncoded), kind: encoded.kind,
        __imageViewerCleanResourceCache: encoded.__imageViewerCleanResourceCache })
    } catch { return undefined }
  }
  const value = arg as GalleryEntry
  return value.__imageViewerEntry === true && typeof value.rootPath === 'string' &&
    typeof value.targetPath === 'string' && ['root', 'folder', 'file', 'image'].includes(value.kind)
    ? value : undefined
}

/** The registry embeds JSON into an HTML script; encode paths rather than allowing literal script delimiters. */
export function galleryEntryToArg(entry: GalleryEntry) {
  return { __imageViewerEntry: true, rootPathEncoded: encodeURIComponent(entry.rootPath),
    targetPathEncoded: encodeURIComponent(entry.targetPath), kind: entry.kind,
    ...(entry.__imageViewerCleanResourceCache ? { __imageViewerCleanResourceCache: true } : {}) }
}

export function commandArgToFsPath(arg: unknown): string {
  const entry = galleryEntryFromArg(arg)
  if (entry) { return entry.targetPath }
  if (typeof arg === 'string') { return arg }
  if (!arg || typeof arg !== 'object') { return '' }
  const value = arg as { fsPath?: string; path?: string }
  return value.fsPath || (value.path?.replace(/^\/([a-zA-Z]:\/)/, '$1') ?? '')
}

export interface GalleryScanResult {
  projectPath: string
  scopePath: string
  imgs: RawWorkspaceImage[]
  requestId: number
  complete: boolean
  error?: string
}

export interface GalleryEntryResult {
  entry?: GalleryEntry
  image?: RawWorkspaceImage
  error?: string
}
