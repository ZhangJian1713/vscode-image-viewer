import * as fs from 'fs'
import * as path from 'path'
import { Webview, Uri } from 'vscode'
import { utils } from '@easy_vscode/core'
import imageSize from 'image-size'
import { readLocalConfigFile } from './config'
import { compileFolderFilters } from '../../folderFilterRules'

export const SUPPORT_IMG_TYPES = [
  '.svg',
  '.png',
  '.jpeg',
  '.jpg',
  '.ico',
  '.gif',
  '.webp',
  '.bmp',
  '.tif',
  '.tiff',
  '.apng',
  '.avif'
]
const { getProjectPath } = utils

/** macOS AppleDouble sidecar files on exFAT/USB (e.g. ._085.jpg); they may look like images by extension but are not bitmap content. */
function isAppleDoubleSidecarFile(absPath: string): boolean {
  return path.basename(absPath).startsWith('._')
}

interface IImage {
  path: string
  /** Absolute filesystem path; used for disk cache / RPC (same as dfs `filePath`). */
  fullPath: string
  vscodePath: string
  size: number
  mtimeMs: number
}

/** Async traversal avoids blocking the shared extension host; directory symlinks are not followed. */
async function searchImgs(
  basePath: string,
  includeFolders: string[],
  excludeFolders: string[],
  webview: Webview,
  listScopeAbsPath: string | null,
  cancellation: { cancelled: boolean }
): Promise<IImage[]> {
  const imgs: IImage[] = []
  const directories = new Set<string>()
  const filters = compileFolderFilters(includeFolders, excludeFolders, process.platform === 'win32')
  const scope = listScopeAbsPath ? path.relative(basePath, listScopeAbsPath) : ''
  if (scope === '..' || scope.startsWith(`..${path.sep}`) || path.isAbsolute(scope)) {
    throw new Error('The selected folder is outside the project.')
  }
  const stack = filters.scanRoots(scope).map((folder) => path.resolve(basePath, folder))
  const rootDirectories = new Set(stack)
  let unreadableRoots = 0
  const canonicalBase = await fs.promises.realpath(basePath)
  while (stack.length) {
    if (cancellation.cancelled) {
      throw new Error('Scan cancelled')
    }
    const directory = path.normalize(stack.pop()!)
    const relativeDirectory = path.relative(basePath, directory).replace(/\\/g, '/')
    if (
      directories.has(directory) ||
      filters.excludes(relativeDirectory) ||
      path.basename(directory) === 'node_modules'
    ) {
      continue
    }
    directories.add(directory)
    let entries: fs.Dirent[]
    try {
      if (rootDirectories.has(directory) && directory !== basePath) {
        const stat = await fs.promises.lstat(directory)
        const canonical = await fs.promises.realpath(directory)
        const relative = path.relative(canonicalBase, canonical)
        if (
          stat.isSymbolicLink() ||
          relative === '..' ||
          relative.startsWith(`..${path.sep}`) ||
          path.isAbsolute(relative)
        ) {
          continue
        }
      }
      entries = await fs.promises.readdir(directory, { withFileTypes: true })
    } catch {
      if (rootDirectories.has(directory)) {
        unreadableRoots++
      }
      continue
    }
    const files: string[] = []
    const included = filters.includes(relativeDirectory)
    for (const entry of entries) {
      const filePath = path.join(directory, entry.name)
      if (entry.isDirectory()) {
        stack.push(filePath)
      } else if (
        included &&
        entry.isFile() &&
        !isAppleDoubleSidecarFile(filePath) &&
        SUPPORT_IMG_TYPES.includes(path.extname(entry.name).toLowerCase())
      ) {
        files.push(filePath)
      }
    }
    for (let start = 0; start < files.length; start += 16) {
      if (cancellation.cancelled) {
        throw new Error('Scan cancelled')
      }
      const batch = await Promise.all(
        files.slice(start, start + 16).map(async (filePath) => {
          try {
            const stat = await fs.promises.stat(filePath)
            return {
              path: '/' + path.relative(basePath, filePath).replace(/\\/g, '/'),
              fullPath: filePath,
              vscodePath: webview.asWebviewUri(Uri.file(filePath)).toString(),
              size: stat.size,
              mtimeMs: stat.mtimeMs
            }
          } catch {
            return null
          }
        })
      )
      for (const image of batch) {
        if (image) {
          imgs.push(image)
        }
      }
    }
  }
  if (rootDirectories.size > 0 && unreadableRoots === rootDirectories.size) {
    throw new Error('Unable to read the selected image folders.')
  }
  return imgs
}

export const getAllImgs = async (
  webview: Webview,
  listScopeAbsPath: string | null = null,
  cancellation = { cancelled: false }
): Promise<IImage[]> => {
  const { includeFolders, excludeFolders } = readLocalConfigFile()
  return searchImgs(
    path.resolve(getProjectPath()),
    includeFolders,
    excludeFolders,
    webview,
    listScopeAbsPath,
    cancellation
  )
}

export const getImageBase64 = (filePath: string): string => {
  const bitmap = fs.readFileSync(filePath)
  let imgType = filePath.substring(filePath.lastIndexOf('.') + 1).toLowerCase()
  const map = {
    svg: 'svg+xml',
    tif: 'tiff'
  }
  imgType = map[imgType] ?? imgType
  const imgBase64 = `data:image/${imgType};base64,` + Buffer.from(bitmap).toString('base64')
  return imgBase64
}

export const getImageSize = (filePath: string): { width: number; height: number } => {
  let dimensions = { width: 0, height: 0 }
  try {
    dimensions = imageSize(filePath)
  } catch {
    // Unsupported/corrupt headers are displayed as unknown dimensions, without per-file logs.
  }
  return dimensions
}
