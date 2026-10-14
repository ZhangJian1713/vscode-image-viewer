import type { ImageSortMode } from 'types'

export interface SortableImage {
  fileName: string
  fileType?: string
  path: string
  fullPath: string
  size: number
  mtimeMs?: number
}

// Reuse the collator: constructing locale options for every comparison dominates large flat galleries.
const imageNameCollator = new Intl.Collator(undefined, { sensitivity: 'base', numeric: true })

export const IMAGE_SORT_OPTIONS: { value: ImageSortMode }[] = [
  { value: 'nameAsc' },
  { value: 'nameDesc' },
  { value: 'mtimeAsc' },
  { value: 'mtimeDesc' },
  { value: 'sizeAsc' },
  { value: 'sizeDesc' },
  { value: 'typeAsc' },
  { value: 'typeDesc' },
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
  if (clickFilePath) {
    const priority = Number(sameImageFsPath(b.fullPath, clickFilePath)) - Number(sameImageFsPath(a.fullPath, clickFilePath))
    if (priority) {
      return priority
    }
  }

  let c = 0
  switch (mode) {
    case 'nameAsc':
      c = imageNameCollator.compare(a.fileName, b.fileName)
      break
    case 'nameDesc':
      c = imageNameCollator.compare(b.fileName, a.fileName)
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
    case 'typeAsc':
    case 'typeDesc': {
      const extension = (image: SortableImage) => (image.fileType ?? image.fileName.slice(image.fileName.lastIndexOf('.') + 1)).toLowerCase()
      c = imageNameCollator.compare(extension(a), extension(b)) * (mode === 'typeAsc' ? 1 : -1)
      break
    }
    default:
      c = imageNameCollator.compare(a.fileName, b.fileName)
  }
  if (c !== 0) {
    return c
  }
  return imageNameCollator.compare(a.fileName, b.fileName) || (a.path < b.path ? -1 : a.path > b.path ? 1 : 0)
}
