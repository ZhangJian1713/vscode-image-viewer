import * as fs from 'fs'
import * as path from 'path'
import { commandArgToFsPath, GalleryEntry, galleryEntryFromArg } from '../galleryEntry'
import { IMAGE_FILE_PATTERNS } from '../constants'

/** Matches the webview-side `commandArgToFsPath`: VS Code Uri JSON payload shape. */
export { commandArgToFsPath } from '../galleryEntry'

function normalizePanelPathKey(absPath: string): string {
  const n = path.normalize(absPath)
  if (process.platform === 'win32') {
    return n.toLowerCase()
  }
  return n
}

export function createGalleryEntry(arg: unknown, projectPath: string, roots = [projectPath]): GalleryEntry {
  const raw = commandArgToFsPath(arg)
  const targetPath = raw ? path.resolve(raw) : ''
  const previous = galleryEntryFromArg(arg)
  const candidate = previous?.rootPath || targetPath || projectPath
  const rootPath = roots.map((root) => path.resolve(root)).sort((a, b) => b.length - a.length)
    .find((root) => {
      const relative = path.relative(normalizePanelPathKey(root), normalizePanelPathKey(candidate))
      return relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative)
    })
  if (!rootPath) { throw new Error('The selected resource is outside the open workspace folders.') }
  if (targetPath) {
    const relative = path.relative(rootPath, targetPath)
    if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
      throw new Error('The selected resource is outside the open workspace folders.')
    }
  }
  let kind: GalleryEntry['kind'] = targetPath ? 'folder' : 'root'
  if (targetPath) {
    try {
      if (fs.statSync(targetPath).isFile()) {
        kind = IMAGE_FILE_PATTERNS.includes(`*${path.extname(targetPath).toLowerCase()}`) ? 'image' : 'file'
      }
    } catch { kind = path.extname(targetPath) ? 'file' : 'folder' }
  }
  return { __imageViewerEntry: true, rootPath, targetPath, kind,
    ...((arg as GalleryEntry)?.__imageViewerCleanResourceCache ? { __imageViewerCleanResourceCache: true } : {}) }
}

/** All entry points belonging to the same workspace folder share one panel. */
export function imageViewerPanelInstanceKey(args: unknown[], projectPath: string): string {
  return normalizePanelPathKey(galleryEntryFromArg(args?.[0])?.rootPath || projectPath)
}

export function imageViewerPanelTitle(args: unknown[], projectPath: string, defaultTitle: string): string {
  const root = galleryEntryFromArg(args?.[0])?.rootPath || projectPath
  return `${defaultTitle} — ${path.basename(root)}`
}
