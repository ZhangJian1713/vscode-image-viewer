import type { ImageSortMode } from 'types'

export interface SortableImage {
  fileName: string
  path: string
  fullPath: string
  size: number
  mtimeMs?: number
}

export const IMAGE_SORT_OPTIONS: { value: ImageSortMode; label: string }[] = [
  { value: 'nameAsc', label: 'Sort by file name (A–Z)' },
  { value: 'nameDesc', label: 'Sort by file name (Z–A)' },
  { value: 'mtimeAsc', label: 'Sort by modified time (oldest first)' },
  { value: 'mtimeDesc', label: 'Sort by modified time (newest first)' },
  { value: 'sizeAsc', label: 'Sort by file size (smallest first)' },
  { value: 'sizeDesc', label: 'Sort by file size (largest first)' }
]

export function compareImagesForSort(
  mode: ImageSortMode,
  clickFilePath: string | undefined,
  a: SortableImage,
  b: SortableImage
): number {
  if (clickFilePath && a.fullPath === clickFilePath) {
    return -1
  }
  if (clickFilePath && b.fullPath === clickFilePath) {
    return 1
  }

  const nameOpts: Intl.CollatorOptions = { numeric: true, sensitivity: 'base' }
  let c = 0
  switch (mode) {
    case 'nameAsc':
      c = a.fileName.localeCompare(b.fileName, undefined, nameOpts)
      break
    case 'nameDesc':
      c = b.fileName.localeCompare(a.fileName, undefined, nameOpts)
      break
    case 'mtimeAsc':
      c = (a.mtimeMs ?? 0) - (b.mtimeMs ?? 0)
      break
    case 'mtimeDesc':
      c = (b.mtimeMs ?? 0) - (a.mtimeMs ?? 0)
      break
    case 'sizeAsc':
      c = (a.size ?? 0) - (b.size ?? 0)
      break
    case 'sizeDesc':
      c = (b.size ?? 0) - (a.size ?? 0)
      break
    default:
      c = a.fileName.localeCompare(b.fileName, undefined, nameOpts)
  }
  if (c !== 0) {
    return c
  }
  return a.path.localeCompare(b.path, undefined, nameOpts)
}
