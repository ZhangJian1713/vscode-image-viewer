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

function normalizeFsPathForComparison(value: string): string {
  const normalized = value.replace(/\\/g, '/').replace(/\/+$/, '')
  return /^[a-zA-Z]:\//.test(normalized) ? normalized.toLowerCase() : normalized
}

export function sameImageFsPath(a: string | undefined, b: string | undefined): boolean {
  if (!a || !b) {
    return false
  }
  return normalizeFsPathForComparison(a) === normalizeFsPathForComparison(b)
}

export function compareImagesForSort(
  mode: ImageSortMode,
  clickFilePath: string | undefined,
  a: SortableImage,
  b: SortableImage
): number {
  if (sameImageFsPath(a.fullPath, clickFilePath)) {
    return -1
  }
  if (sameImageFsPath(b.fullPath, clickFilePath)) {
    return 1
  }

  let c = 0
  switch (mode) {
    case 'nameAsc':
      c = a.fileName.localeCompare(b.fileName, undefined, { sensitivity: 'base' })
      break
    case 'nameDesc':
      c = b.fileName.localeCompare(a.fileName, undefined, { sensitivity: 'base' })
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
      c = a.fileName.localeCompare(b.fileName, undefined, { sensitivity: 'base' })
  }
  if (c !== 0) {
    return c
  }
  return a.path.localeCompare(b.path)
}
