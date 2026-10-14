import type { GalleryLayoutMode } from '../../types'

export const MAX_GALLERY_COLUMNS = 20

// WebView 对 CSS 内容高度有上限；控制真实滚动空间，逻辑行坐标仍保持原来的像素精度。
const MAX_SCROLL_HEIGHT = 8_000_000
export const galleryScrollHeight = (logicalHeight: number) => Math.min(MAX_SCROLL_HEIGHT, logicalHeight)
export function galleryLogicalScrollTop(physicalTop: number, logicalHeight: number, viewportHeight: number): number {
  const physicalRange = Math.max(0, galleryScrollHeight(logicalHeight) - viewportHeight)
  const logicalRange = Math.max(0, logicalHeight - viewportHeight)
  return physicalRange ? Math.max(0, Math.min(physicalRange, physicalTop)) / physicalRange * logicalRange : 0
}
export function galleryPhysicalScrollTop(logicalTop: number, logicalHeight: number, viewportHeight: number): number {
  const logicalRange = Math.max(0, logicalHeight - viewportHeight)
  return logicalRange ? Math.max(0, Math.min(logicalRange, logicalTop)) / logicalRange * Math.max(0, galleryScrollHeight(logicalHeight) - viewportHeight) : 0
}

export interface GalleryGeometry {
  columns: number
  gap: number
  padding: number
  imageEdge: number
  captionHeight: number
  rowHeight: number
  rowStride: number
  rowCount: number
  totalHeight: number
}

/** Adapted from Media Lens's uniform layout: only materialize the visible window, never an item-sized position array. */
export function galleryGeometry(
  count: number,
  width: number,
  columns: number,
  mode: GalleryLayoutMode,
  compact: boolean,
  listThumbSize = 64,
  showFileSize = true
): GalleryGeometry {
  const list = mode === 'list'
  const padding = compact ? 0 : 12
  const gap = list ? 0 : compact ? 0 : 12
  const availableWidth = Math.max(1, width - padding * 2)
  const cols = list
    ? 1
    : Math.max(1, Math.min(MAX_GALLERY_COLUMNS, Math.round(columns), Math.floor((availableWidth + gap) / (gap + 1))))
  const imageEdge = list
    ? Math.min(listThumbSize, Math.max(32, availableWidth / 4))
    : Math.max(1, (availableWidth - gap * (cols - 1)) / cols)
  const captionHeight = list || compact ? 0 : showFileSize ? 40 : 26
  const rowHeight = list ? Math.max(48, imageEdge + (compact ? 8 : 16)) : imageEdge + captionHeight
  const rowStride = rowHeight + gap
  const rowCount = Math.ceil(count / cols)
  return {
    columns: cols,
    gap,
    padding,
    imageEdge,
    captionHeight,
    rowHeight,
    rowStride,
    rowCount,
    totalHeight: rowCount ? rowCount * rowStride - gap + padding * 2 : 0
  }
}

/** 完全离屏时返回空区间；所有索引都夹紧到合法行，快速拖动不会制造越界空行。 */
export function galleryWindow(
  geometry: GalleryGeometry,
  scrollTop: number,
  viewportHeight: number
): { start: number; end: number } {
  const { rowCount, rowStride, padding } = geometry
  if (!rowCount || viewportHeight <= 0) {
    return { start: 0, end: 0 }
  }
  const overscan = Math.min(400, viewportHeight / 2)
  const start = Math.min(rowCount, Math.max(0, Math.floor((scrollTop - padding - overscan) / rowStride)))
  const end = Math.min(
    rowCount,
    Math.max(start, Math.ceil((scrollTop + viewportHeight - padding + overscan) / rowStride))
  )
  return { start, end }
}

export function formatImageBytes(bytes: number): string {
  if (!bytes) {
    return '0 B'
  }
  const units = ['B', 'KB', 'MB', 'GB']
  const exponent = Math.min(3, Math.floor(Math.log(bytes) / Math.log(1024)))
  return `${Number((bytes / Math.pow(1024, exponent)).toFixed(exponent ? 1 : 0))} ${units[exponent]}`
}
