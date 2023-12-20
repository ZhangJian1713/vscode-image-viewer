import * as fs from 'fs'
import * as path from 'path'
import { Webview, Uri } from 'vscode'
import { utils } from '@easy_vscode/core'
import imageSize from 'image-size'
import { readLocalConfigFile } from './config'

export const SUPPORT_IMG_TYPES = ['.svg', '.png', '.jpeg', '.jpg', '.ico', '.gif', '.webp', '.bmp', '.tif', '.tiff', '.apng', '.avif']
const { getProjectPath } = utils



interface IImage {
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

function searchImgs(basePath: string, includeFolders: string[], excludeFolders: string[], webview: Webview) {
  // const imgs: any = new Map<string, IImage>()
  const imgs: IImage[] = []
  const searchedFolders = new Set<string>()
  const excludeFoldersSet = new Set(excludeFolders.map(folder => basePath + '/' + removeSlash(folder)))
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
 * get all imgs
 */
export const getAllImgs = (webview: Webview) => {
  const config = readLocalConfigFile()
  const { includeFolders, excludeFolders } = config
  const basePath = getProjectPath()
  const beginTime = new Date()
  const imgs = searchImgs(basePath, includeFolders, excludeFolders, webview)
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