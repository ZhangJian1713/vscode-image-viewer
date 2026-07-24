import * as fs from 'fs'
import * as path from 'path'
import { Webview, Uri } from 'vscode'
import { workspace } from 'vscode'
import imageSize from 'image-size'
import { readLocalConfigFile } from './config'

export const SUPPORT_IMG_TYPES = ['.svg', '.png', '.jpeg', '.jpg', '.ico', '.gif', '.webp', '.bmp', '.tif', '.tiff', '.apng', '.avif']
function getProjectPath(): string {
  return workspace.workspaceFolders?.[0]?.uri.fsPath ?? ''
}

/** macOS AppleDouble sidecar files on exFAT/USB (e.g. ._085.jpg); they may look like images by extension but are not bitmap content. */
function isAppleDoubleSidecarFile(absPath: string): boolean {
  return path.basename(absPath).startsWith('._')
}

export function isSupportedImageFile(absPath: string): boolean {
  return !isAppleDoubleSidecarFile(absPath) && SUPPORT_IMG_TYPES.includes(path.extname(absPath).toLowerCase())
}



interface IImage {
  path: string
  /** Absolute filesystem path; used for disk cache / RPC (same as dfs `filePath`). */
  fullPath: string
  vscodePath: string
  size: number
  mtimeMs: number
}

/**
 * remove last slash of file path
 */
const removeLastSlash = (path: string) => path.endsWith('/') ? path.slice(0, -1) : path

/**
 * remove first slash of file path
 */
const removeFirstSlash = (path: string) => path.startsWith('/') ? path.slice(1) : path

/**
 * remove first and last slash of file path
 */
const removeSlash = (path: string) => removeLastSlash(removeFirstSlash(path))

function searchImgs(
  basePath: string,
  includeFolders: string[],
  excludeFolders: string[],
  webview: Webview,
  /** When set, recurse only this directory tree (including subfolders), ignoring `includeFolders` (used by Explorer context actions). */
  listScopeAbsPath: string | null
) {
  // const imgs: any = new Map<string, IImage>()
  const imgs: IImage[] = []
  const searchedFolders = new Set<string>()
  let workspaceRealPath: string
  try {
    workspaceRealPath = fs.realpathSync(basePath)
  } catch {
    return imgs
  }
  const isInsideWorkspace = (candidate: string): boolean =>
    candidate === workspaceRealPath || candidate.startsWith(workspaceRealPath + path.sep)
  const resolveWorkspaceDirectory = (folder: string): string | null => {
    try {
      const resolved = path.resolve(basePath, removeSlash(folder))
      if (resolved !== basePath && !resolved.startsWith(basePath + path.sep)) return null
      const real = fs.realpathSync(resolved)
      return isInsideWorkspace(real) && fs.statSync(real).isDirectory() ? real : null
    } catch {
      return null
    }
  }
  const excludeFoldersSet = new Set(excludeFolders.map(resolveWorkspaceDirectory).filter((folder): folder is string => folder !== null))
  // eslint-disable-next-line no-unused-vars
  const dfs = (pathname: string, callback: (filePath: string) => void) => {
    try {
      const stats = fs.lstatSync(pathname)
      if (stats.isDirectory() && !pathname.includes('node_modules')) {
        if (stats.isSymbolicLink()) return
        const realPath = fs.realpathSync(pathname)
        if (!isInsideWorkspace(realPath)) return
        pathname = realPath
        if (excludeFoldersSet.has(pathname)) {
          return
        }
        if (searchedFolders.has(pathname)) {
          return
        }
        searchedFolders.add(pathname)
        const files = fs.readdirSync(pathname)
        files.forEach((file) => {
          dfs(pathname + '/' + file, callback)
        })
      } else if (stats.isFile()) {
        if (!stats.isSymbolicLink() && isSupportedImageFile(pathname)) {
          const realPath = fs.realpathSync(pathname)
          if (isInsideWorkspace(realPath)) callback && callback(realPath)
        }
      }
    } catch (e) {
      console.log(e)
    }
  }
  const searchFolders =
    listScopeAbsPath != null
      ? [path.normalize(listScopeAbsPath)]
      : includeFolders.length > 0
        ? includeFolders.map(resolveWorkspaceDirectory).filter((folder): folder is string => folder !== null)
        : [workspaceRealPath]
  searchFolders.forEach((folder) => {
    dfs(folder, (filePath: string) => {
      const st = fs.statSync(filePath)
      const relativePath = filePath.replace(basePath, '')
      // vscodePath e.g. https://file%2B.vscode-resource.vscode-cdn.net/Users/user_name/project_dir/src/favicon.ico
      const vscodePath = webview.asWebviewUri(Uri.file(filePath)).toString()
      const img = {
        path: relativePath,
        fullPath: filePath,
        vscodePath,
        size: st.size,
        mtimeMs: st.mtimeMs
      }
      imgs.push(img)
    })
  })
  return imgs
}

/**
 * get all imgs
 * @param listScopeAbsPath List only this directory tree; when null, search by configured `includeFolders` or the whole workspace.
 */
export const getAllImgs = (webview: Webview, listScopeAbsPath: string | null = null) => {
  const config = readLocalConfigFile()
  const { includeFolders, excludeFolders } = config
  const basePath = getProjectPath()
  const beginTime = new Date()
  const imgs = searchImgs(basePath, includeFolders, excludeFolders, webview, listScopeAbsPath)
  const endTime = new Date()
  console.log(`${imgs.length} images found in ${(endTime.getTime() - beginTime.getTime())}ms`)
  return imgs
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


export const getImageSize = (filePath: string): { width: number, height: number } => {
  let dimensions = { width: 0, height: 0 }
  try {
    dimensions = imageSize(filePath)
  } catch (err) {
    console.log(err)
  }
  return dimensions
}
