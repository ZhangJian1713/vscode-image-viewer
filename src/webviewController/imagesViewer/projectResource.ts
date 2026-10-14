import * as fs from 'fs'
import * as path from 'path'
import { IMAGE_FILE_PATTERNS } from '../../constants'

export function isPathInsideRoot(root: string, target: string): boolean {
  const relative = path.relative(root, target)
  return relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative)
}

/** Validate both the supplied path and its symlink-resolved target before accessing it. */
export async function assertProjectResource(root: string, value: unknown, imageOnly = false) {
  if (typeof value !== 'string' || !value || value.length > 32768 || value.includes('\0') || !path.isAbsolute(value)) {
    throw new Error('A valid absolute resource path is required.')
  }
  const requested = path.resolve(value)
  if (!isPathInsideRoot(root, requested)) { throw new Error('This resource is outside the current project.') }
  const [canonicalRoot, target] = await Promise.all([fs.promises.realpath(root), fs.promises.realpath(requested)])
  if (!isPathInsideRoot(canonicalRoot, target)) { throw new Error('This resource is outside the current project.') }
  const stat = await fs.promises.stat(target)
  if (!stat.isFile() && !stat.isDirectory()) { throw new Error('This resource is not a regular file or folder.') }
  if (imageOnly && (!stat.isFile() || !IMAGE_FILE_PATTERNS.includes(`*${path.extname(target).toLowerCase()}`))) {
    throw new Error('This action requires a supported image file.')
  }
  return { target, relative: path.relative(canonicalRoot, target), stat }
}
