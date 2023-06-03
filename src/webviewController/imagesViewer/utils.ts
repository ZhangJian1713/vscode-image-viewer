import * as fs from 'fs'
import * as path from 'path'
import { Webview, Uri } from 'vscode'
import { utils } from '@easy_vscode/core'
import imageSize from 'image-size'

export const SUPPORT_IMG_TYPES = ['.svg', '.png', '.jpeg', '.jpg', '.ico', '.gif', '.webp', '.bmp', '.tif', '.apng', '.avif']
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
    const size = fs.statSync(filePath)?.size
    const relativePath = filePath.replace(getProjectPath(), '')
    // vscodePath e.g. https://file%2B.vscode-resource.vscode-cdn.net/Users/user_name/project_dir/src/favicon.ico
    const vscodePath = webview.asWebviewUri(Uri.file(filePath)).toString()
    const img = {
      path: relativePath,
      vscodePath,
      size
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
  console.log(`Search for images in ${basePath}`)
  const beginTime = new Date()
  const imgs = searchImgs(basePath, webview)
  const endTime = new Date()
  console.log(`${imgs.length} images found in ${(endTime.getTime() - beginTime.getTime())}ms`)
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

export const getImageSize = (filePath: string): { width: number, height: number } => {
  let dimensions = { width: 0, height: 0 }
  try {
    dimensions = imageSize(filePath)
  } catch (err) {
    console.log(err)
  }
  return dimensions
}