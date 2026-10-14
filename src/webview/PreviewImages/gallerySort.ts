import type { ImageSortMode } from '../../types'
import { compareImagesForSort, IMAGE_SORT_OPTIONS } from '../imageSort'
import { imageFolder } from './galleryModel'
import type { IImage } from './imageTypes'

export const GALLERY_SORT_OPTIONS = [
  {
    label: 'Folders first · sort within each folder',
    options: IMAGE_SORT_OPTIONS.map(({ value, label }) => ({ value: `folder:${value}`, label: `Folder → ${label}` }))
  },
  {
    label: 'All images · global sort',
    options: IMAGE_SORT_OPTIONS.map(({ value, label }) => ({ value, label: `All → ${label}` }))
  }
]

export function gallerySortSelection(imageSort: ImageSortMode, groupByFolder: boolean): string {
  return groupByFolder ? `folder:${imageSort}` : imageSort
}

export function gallerySortFromSelection(value: string) {
  const galleryGroupByFolder = value.startsWith('folder:')
  const mode = galleryGroupByFolder ? value.slice('folder:'.length) : value
  return {
    imageSort: IMAGE_SORT_OPTIONS.find((option) => option.value === mode)?.value || 'nameAsc',
    galleryGroupByFolder
  }
}

// Match the tree's natural sibling order. Split each folder once, not during every image comparison.
const folderCollator = new Intl.Collator(undefined, { numeric: true })

/** Never mutate the scan snapshot; folder direction stays ascending regardless of the secondary order. */
export function sortGalleryImages(images: readonly IImage[], mode: ImageSortMode, groupByFolder: boolean): IImage[] {
  const compareImages = (a: IImage, b: IImage) => compareImagesForSort(mode, undefined, a, b)
  if (!groupByFolder) {
    return [...images].sort(compareImages)
  }
  const folders = new Map<string, { segments: string[]; images: IImage[] }>()
  for (const image of images) {
    const path = imageFolder(image)
    let bucket = folders.get(path)
    if (!bucket) {
      bucket = { segments: path.split('/').filter(Boolean), images: [] }
      folders.set(path, bucket)
    }
    bucket.images.push(image)
  }
  const ordered = [...folders.values()].sort((a, b) => {
    for (let index = 0; index < Math.min(a.segments.length, b.segments.length); index++) {
      const one = a.segments[index]
      const other = b.segments[index]
      const result = folderCollator.compare(one, other) || (one < other ? -1 : one > other ? 1 : 0)
      if (result) {
        return result
      }
    }
    return a.segments.length - b.segments.length
  })
  const result: IImage[] = []
  for (const bucket of ordered) {
    bucket.images.sort(compareImages)
    // Avoid push(...bucket): a large single folder can exceed the engine's argument limit.
    for (const image of bucket.images) {
      result.push(image)
    }
  }
  return result
}
