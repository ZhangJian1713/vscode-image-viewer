import * as fs from 'fs'
import * as path from 'path'
import { Webview, Uri } from 'vscode'
import imageSize from 'image-size'
import { readLocalConfigFile } from './config'
import * as vscode from 'vscode'
import { IConfigWorkspaceFolders } from 'types'

export const SUPPORT_IMG_TYPES = ['.svg', '.png', '.jpeg', '.jpg', '.ico', '.gif', '.webp', '.bmp', '.tif', '.tiff', '.apng', '.avif']



interface IImage {
  projectDir: string;
  path: string
  vscodePath: string
  size: number
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

function searchImgs(basePath: string, includeFolders: string[], excludeFolders: string[], webview: Webview, workspacePath: string) {
  // const imgs: any = new Map<string, IImage>()
  const imgs: IImage[] = []
  const searchedFolders = new Set<string>()
  const excludeFoldersSet = new Set(excludeFolders.map(folder => basePath + '/' + removeSlash(folder)))
  const projectDir = workspacePath.substring(workspacePath.lastIndexOf('/') + 1)

  // eslint-disable-next-line no-unused-vars
  const dfs = (pathname: string, callback: (filePath: string) => void) => {
    try {
      const stats = fs.statSync(pathname)
      if (stats.isDirectory() && !pathname.includes('node_modules')) {
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
        if (SUPPORT_IMG_TYPES.includes(path.extname(pathname))) {
          callback && callback(pathname)
        }
      }
    } catch (e) {
      console.log(e)
    }
  }
  const searchFolders = includeFolders.length > 0 ? includeFolders.map(folder => basePath + '/' + removeSlash(folder)) : [basePath]
  searchFolders.forEach((folder) => {
    dfs(folder, (filePath: string) => {
      const size = fs.statSync(filePath)?.size
      const relativePath = filePath.replace(basePath, '')
      // vscodePath e.g. https://file%2B.vscode-resource.vscode-cdn.net/Users/user_name/project_dir/src/favicon.ico
      const vscodePath = webview.asWebviewUri(Uri.file(filePath)).toString()
      const img = {
        projectDir,
        path: relativePath,
        vscodePath,
        size
      }
      imgs.push(img)
    })
  })
  return imgs
}

/**
 * get all workspace folders, not just the first as returned by getProjectPath
 */
export const getAllProjectPaths = () => {
  return vscode.workspace.workspaceFolders ? vscode.workspace.workspaceFolders.map((folder) => folder.uri.fsPath.replace(/\\/g, '/')) : [];
}

/**
 * converts a relative path back to an absolute path while attempting to match it to a project path if multiple exists
 */
export const makeAbsoluteProjectPath = (path: string) => {
  const projectPaths = getAllProjectPaths();
  if (projectPaths.length == 1)
    return projectPaths[0] + path;

  const projectDir = path.substring(path.startsWith('/') ? 1 : 0, path.indexOf('/'))
  const projectPath = projectPaths.find((path) => path.endsWith(projectDir))
  return projectPath ? projectPath.substring(0, projectPath.lastIndexOf('/') + 1) + path : path;
}

/**
 * reads the config file and preprocesses it to ensure the contents are valid against current workspace
 */
export const readValidatedConfigFile = () => {
  const config = readLocalConfigFile()
  const projectPaths = getAllProjectPaths();

  // ensure we have entires for all project files and remove ones which no longer exist
  if (!config.includeProjectFolders)
    config.includeProjectFolders = {};
  config.includeProjectFolders = Object.assign({}, ...projectPaths.map((folder) => ({ [folder]: config.includeProjectFolders[folder] ?? true })));
  return config;
}

/**
 * get all imgs
 */
export const getAllImgs = (webview: Webview) => {
  const config = readValidatedConfigFile()
  const { includeFolders, excludeFolders, includeProjectFolders } = config
  const includeProjectFoldersKeys = Object.keys(includeProjectFolders).filter((folder) => includeProjectFolders[folder]);
  const hasMultipleFolders = includeProjectFoldersKeys.length > 1;

  const beginTime = new Date()
  // ES2019: replace with .map and .flat
  let imgs: IImage[] = [];
  includeProjectFoldersKeys.forEach(folder => imgs = [...imgs, ...searchImgs(folder, includeFolders, excludeFolders, webview, hasMultipleFolders ? folder : '')]);
  const endTime = new Date()
  console.log(`${imgs.length} images found in ${(endTime.getTime() - beginTime.getTime())}ms`)
  return imgs
}

export const getImageBase64 = (filePath: string): string => {
  const bitmap = fs.readFileSync(filePath)
  let imgType = filePath.substring(filePath.lastIndexOf('.') + 1)
  const map = {
    svg: 'svg+xml',
    tif: 'tiff'
  }
  imgType = map[imgType] ?? imgType
  const imgBase64 = `data: image/${imgType};base64,` + Buffer.from(bitmap).toString('base64')
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