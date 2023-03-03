import * as fs from 'fs'
import * as path from 'path'
import { Webview, Uri } from 'vscode'
import { utils } from '@easy_vscode/core'

export const SUPPORT_IMG_TYPES = ['.svg', '.png', '.jpeg', '.jpg', '.ico', '.gif', '.webp', '.bmp', '.tif', '.apng']
const { getProjectPath } = utils

function mapDir(pathname: string, callback: any) {
  const stats = fs.statSync(pathname)
  if (stats.isDirectory() && !pathname.includes('node_modules')) {
    const files = fs.readdirSync(pathname)
    files.forEach((file) => {
      mapDir(pathname + '/' + file, callback)
    })
  } else if (stats.isFile()) {
    if (SUPPORT_IMG_TYPES.includes(path.extname(pathname))) {
      callback && callback(pathname)
    }
  }
}

function searchImgs(dir: string, webview: Webview) {
  const imgs: any = []
  mapDir(dir, (filePath: string) => {
    const relativePath = filePath.replace(getProjectPath() + '/', '')
    // vscodePath e.g. https://file%2B.vscode-resource.vscode-cdn.net/Users/user_name/project_dir/src/favicon.ico
    const vscodePath = webview.asWebviewUri(Uri.file(filePath)).toString()
    const img = {
      path: relativePath,
      fullPath: filePath,
      vscodePath
    }
    imgs.push(img)
  })
  return imgs
}

/**
 * get all imgs
 */
export const getAllImgs = (webview: Webview) => {
  const basePath = getProjectPath()
  const imgs = searchImgs(basePath, webview)
  return imgs
}

export const getImageBase64 = (filePath: string): string => {
  const bitmap = fs.readFileSync(filePath)
  let imgType = filePath.substring(filePath.lastIndexOf('.') + 1)
  if (imgType === 'svg') {
    imgType = 'svg+xml'
  }
  const imgBase64 = `data: image/${imgType};base64,` + Buffer.from(bitmap).toString('base64')
  return imgBase64
}