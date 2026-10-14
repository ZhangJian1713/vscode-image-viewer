import type { GalleryEntry } from '../../galleryEntry'
import { sameImageFsPath } from '../imageSort'
import { GalleryFolderIndex, imageFolder, isPathWithinFolder, normalizeGalleryPath } from './galleryModel'
import type { IImage } from './imageTypes'
import type { IConfig } from '../../types'
import { IMAGE_FILE_PATTERNS } from '../../constants'
import { compileFolderFilters } from '../../folderFilterRules'
import { galleryRelativePath } from './galleryModel'

export interface GalleryNavigationResolution {
  folder: string
  image?: IImage
  previewOnly: boolean
  fallback: boolean
}
export interface GalleryRevealRequest { id: number; path: string }

/** An explicitly requested, newly created image may enrich the snapshot without rescanning the project. */
export function includeGalleryEntryImage(images: IImage[], image: IImage, root: string, config: IConfig): IImage[] {
  if (!isPathWithinFolder(image.fullPath, root) || images.some((item) => sameImageFsPath(item.fullPath, image.fullPath))) {
    return images
  }
  try {
    const windowsPath = /^(?:[a-z]:[\\/]|[\\/]{2})/i.test(root)
    const rules = compileFolderFilters(config.includeFolders, config.excludeFolders, windowsPath)
    const folder = galleryRelativePath(imageFolder(image), root)
    return rules.includes(folder) && !rules.excludes(folder) ? [...images, image] : images
  } catch { return images }
}

/** Relax only the view filters that actually hide an explicit Explorer target. Never mutate saved settings. */
export function galleryNavigationFilters(resolution: GalleryNavigationResolution, images: readonly IImage[], config: IConfig) {
  const canonical = (value: string) => value.replace(/^\./, '').toLowerCase()
  let showImageTypes = config.showImageTypes
  const allowed = new Set(showImageTypes.map(canonical))
  const inFolder = (image: IImage) => isPathWithinFolder(imageFolder(image), resolution.folder)
  const hasResources = images.some(inFolder)
  const target = !resolution.previewOnly ? resolution.image : undefined
  if (target && !allowed.has(target.fileType)) {
    showImageTypes = [...showImageTypes, target.fileType]
    allowed.add(target.fileType)
  } else if (!target && hasResources && !images.some((image) => inFolder(image) && allowed.has(image.fileType))) {
    showImageTypes = IMAGE_FILE_PATTERNS.map((pattern) => pattern.slice(1))
    showImageTypes.forEach((type) => allowed.add(canonical(type)))
  }
  const query = config.keyword.toLowerCase()
  const matches = !query || (!target && !hasResources) || (target ? target.path.toLowerCase().includes(query)
    : images.some((image) => inFolder(image) && allowed.has(image.fileType) && image.path.toLowerCase().includes(query)))
  const keyword = matches ? config.keyword : ''
  return keyword === config.keyword && showImageTypes === config.showImageTypes ? null : { keyword, showImageTypes }
}

export function nearestGalleryFolder(index: GalleryFolderIndex, requested: string): string {
  let key = normalizeGalleryPath(requested)
  while (isPathWithinFolder(key, index.root)) {
    if (index.folders.get(key)?.totalCount || sameImageFsPath(key, index.root)) { return key }
    const parent = key.slice(0, key.lastIndexOf('/')) || '/'
    if (parent === key) { break }
    key = parent
  }
  return index.root
}

/** Partial indexes can confirm a target, but cannot prove a directory is empty. */
export function resolveGalleryNavigation(
  entry: GalleryEntry, index: GalleryFolderIndex, images: readonly IImage[], complete: boolean, requestedImage?: IImage
): GalleryNavigationResolution | null {
  const path = normalizeGalleryPath(entry.targetPath || index.root)
  const directory = entry.kind === 'file' || entry.kind === 'image'
    ? path.slice(0, path.lastIndexOf('/')) || '/' : path
  const image = entry.kind === 'image' ? images.find((item) => sameImageFsPath(item.fullPath, path)) : undefined
  if (image) { return { folder: imageFolder(image), image, previewOnly: false, fallback: false } }
  if (!complete && (entry.kind === 'image' || !index.folders.get(directory)?.totalCount)) { return null }
  const folder = nearestGalleryFolder(index, directory)
  return { folder, image: requestedImage, previewOnly: !!requestedImage,
    fallback: !sameImageFsPath(folder, directory) }
}
