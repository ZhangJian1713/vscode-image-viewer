import type { IImage } from './imageTypes'
import type { GalleryGeometry } from './galleryLayout'
import { imageFolder, galleryRelativePath } from './galleryModel'

export interface GalleryFolderHighlight {
  live: boolean
  paths: string[]
}

/** 只检查与视口相交的图片，不把 overscan 中预挂载的图片算进目录提示。 */
export function visibleGalleryFolders(images: readonly IImage[], geometry: GalleryGeometry, top: number, height: number): string[] {
  if (height <= 0 || !images.length) {
    return []
  }
  const firstRow = Math.max(0, Math.floor((top - geometry.padding - geometry.imageEdge) / geometry.rowStride) + 1)
  const lastRow = Math.min(geometry.rowCount, Math.ceil((top + height - geometry.padding) / geometry.rowStride))
  const paths = new Set<string>()
  for (let index = firstRow * geometry.columns; index < Math.min(images.length, lastRow * geometry.columns); index++) {
    paths.add(imageFolder(images[index]))
  }
  return Array.from(paths)
}

export function folderHudModel(paths: readonly string[], root: string, height: number) {
  const labels = paths.map((path) => galleryRelativePath(path, root) || '.')
  const parts = labels.map((label) => label.split('/'))
  let common = parts[0]?.slice(0, -1) ?? []
  for (const segments of parts.slice(1)) {
    common = common.filter((part, index) => index < segments.length - 1 && common.slice(0, index + 1).every((value, i) => value === segments[i]))
  }
  const header = labels.length > 1 && common.length >= 2 ? common.join('/') : ''
  const rows = header ? labels.map((label) => label.slice(header.length + 1)) : labels
  const budget = Math.max(3, Math.floor((Math.min(360, height * 0.45) - 16 - (header ? 24 : 0)) / 22))
  const omitted = rows.length > budget
  const headCount = omitted ? Math.ceil((budget - 1) / 2) : rows.length
  const tail = omitted ? rows.slice(-Math.floor((budget - 1) / 2)) : []
  return { header, head: rows.slice(0, headCount), tail, omitted,
    height: 16 + (header ? 24 : 0) + (omitted ? headCount + tail.length + 1 : rows.length) * 22 }
}

export function folderHudPosition(scrollTop: number, contentHeight: number, viewportHeight: number, hudHeight: number) {
  const thumbHeight = Math.min(viewportHeight, Math.max(24, viewportHeight * viewportHeight / Math.max(1, contentHeight)))
  const progress = Math.min(1, Math.max(0, scrollTop / Math.max(1, contentHeight - viewportHeight)))
  const center = thumbHeight / 2 + progress * (viewportHeight - thumbHeight)
  const top = Math.max(8, Math.min(viewportHeight - hudHeight - 8, center - hudHeight / 2))
  return { top, caret: Math.max(10, Math.min(hudHeight - 10, center - top)) }
}
