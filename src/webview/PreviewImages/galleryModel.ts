import type { IImage } from './imageTypes'
import type { IConfig } from '../../types'
import { MAX_GALLERY_COLUMNS } from './galleryLayout'

export type RawWorkspaceImage = Pick<IImage, 'path' | 'vscodePath' | 'size'> & {
  fullPath?: string
  mtimeMs?: number
}

export interface GalleryFolder {
  key: string
  name: string
  parent: string | null
  children: string[]
  directCount: number
  totalCount: number
}

export interface GalleryFolderIndex {
  root: string
  folders: Map<string, GalleryFolder>
}

const folderNameCollator = new Intl.Collator(undefined, { numeric: true })

export function normalizeGalleryPath(value: string): string {
  const normalized = value.replace(/\\/g, '/').replace(/\/+$/, '')
  return normalized || '/'
}

export function isPathWithinFolder(value: string, folder: string): boolean {
  let candidate = normalizeGalleryPath(value)
  let root = normalizeGalleryPath(folder)
  if (/^[a-z]:/i.test(root)) {
    candidate = candidate.toLowerCase()
    root = root.toLowerCase()
  }
  return candidate === root || candidate.startsWith(root === '/' ? '/' : `${root}/`)
}

export function imageFolder(img: IImage): string {
  const fullPath = normalizeGalleryPath(img.fullPath)
  return fullPath.slice(0, fullPath.lastIndexOf('/')) || '/'
}

export function galleryRelativePath(value: string, root: string): string {
  const normalized = normalizeGalleryPath(value)
  const base = normalizeGalleryPath(root)
  return isPathWithinFolder(normalized, base)
    ? normalized.slice(base === '/' ? 1 : base.length).replace(/^\//, '')
    : normalized
}

export function completeGalleryImages(raw: RawWorkspaceImage[], projectPath: string): IImage[] {
  return raw.map((image) => {
    const relative = image.path.replace(/\\/g, '/')
    const fileName = relative.slice(relative.lastIndexOf('/') + 1)
    return {
      ...image,
      path: relative,
      fullPath:
        image.fullPath ||
        `${projectPath === '/' ? '' : normalizeGalleryPath(projectPath)}/${relative.replace(/^\/+/, '')}`,
      fileName,
      fileType: fileName.slice(fileName.lastIndexOf('.') + 1).toLowerCase(),
      dirPath: relative.slice(0, relative.lastIndexOf('/') + 1)
    }
  })
}

/** 图片只计入直属桶；从叶到根合计一次，避免每张图片反复更新整条祖先链。 */
export function buildGalleryFolderIndex(images: IImage[], rootPath: string): GalleryFolderIndex {
  const root = normalizeGalleryPath(rootPath)
  const folders = new Map<string, GalleryFolder>()
  const create = (key: string, parent: string | null): GalleryFolder => {
    const folder = { key, parent, name: key.split('/').pop() || key, children: [], directCount: 0, totalCount: 0 }
    folders.set(key, folder)
    if (parent) {
      folders.get(parent)!.children.push(key)
    }
    return folder
  }
  create(root, null)
  for (const img of images) {
    const directory = imageFolder(img)
    if (!isPathWithinFolder(directory, root)) {
      continue
    }
    let folder = folders.get(directory)
    if (!folder) {
      let parent = root
      for (const segment of galleryRelativePath(directory, root).split('/').filter(Boolean)) {
        const key = parent === '/' ? `/${segment}` : `${parent}/${segment}`
        if (!folders.has(key)) {
          create(key, parent)
        }
        parent = key
      }
      folder = folders.get(parent)!
    }
    folder.directCount++
  }
  const insertionOrder = Array.from(folders.values())
  for (let i = insertionOrder.length - 1; i >= 0; i--) {
    const folder = insertionOrder[i]
    folder.totalCount += folder.directCount
    if (folder.parent) {
      folders.get(folder.parent)!.totalCount += folder.totalCount
    }
    folder.children.sort((one, other) => folderNameCollator.compare(folders.get(one)!.name, folders.get(other)!.name))
  }
  return { root, folders }
}

export function folderAncestors(index: GalleryFolderIndex, key: string): string[] {
  const ancestors: string[] = []
  let folder = index.folders.get(key)
  while (folder) {
    ancestors.unshift(folder.key)
    folder = folder.parent ? index.folders.get(folder.parent) : undefined
  }
  return ancestors
}

export function visibleFolderRows(
  index: GalleryFolderIndex,
  expanded: ReadonlySet<string>
): Array<{ key: string; depth: number }> {
  const rows: Array<{ key: string; depth: number }> = []
  const stack = [{ key: index.root, depth: 0 }]
  while (stack.length) {
    const row = stack.pop()!
    rows.push(row)
    if (!expanded.has(row.key)) {
      continue
    }
    const children = index.folders.get(row.key)!.children
    for (let i = children.length - 1; i >= 0; i--) {
      stack.push({ key: children[i], depth: row.depth + 1 })
    }
  }
  return rows
}

export function normalizedGalleryConfig(config: Partial<IConfig>): Partial<IConfig> {
  const columns = Math.max(1, Math.min(MAX_GALLERY_COLUMNS, Math.round(Number(config.imageGridColumns) || 8)))
  return {
    ...config,
    galleryGroupByFolder: config.galleryGroupByFolder !== false,
    imageGridColumns: columns,
    galleryLayout: ['grid', 'fill', 'list'].includes(config.galleryLayout) ? config.galleryLayout : 'grid',
    galleryCompact: Boolean(config.galleryCompact),
    galleryShowFileSize: config.galleryShowFileSize !== false,
    gallerySidebarVisible: config.gallerySidebarVisible !== false,
    gallerySidebarWidth: Math.max(160, Math.min(440, Number(config.gallerySidebarWidth) || 230)),
    galleryIncludeSubfolders: config.galleryIncludeSubfolders !== false,
    galleryExpandedFolders: Array.isArray(config.galleryExpandedFolders) ? config.galleryExpandedFolders : undefined,
    galleryListThumbSize: Math.max(40, Math.min(160, Number(config.galleryListThumbSize) || 64))
  }
}
