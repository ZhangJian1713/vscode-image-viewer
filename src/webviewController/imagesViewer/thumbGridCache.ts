/** Grid thumbnails: JPEG files in globalStorage, served through `asWebviewUri`. macOS uses in-process ImageIO. */
/* eslint-disable @typescript-eslint/no-var-requires */
import { createHash } from 'crypto'
import * as fs from 'fs'
import { readImageDimensions } from './imageDimensions'
import * as path from 'path'
import { setTimeout, setInterval, clearTimeout, clearInterval } from 'timers'
import { utils } from '@easy_vscode/core'
import { ExtensionContext, Uri, workspace, extensions } from 'vscode'
import { thumbnailEvictionCandidates } from './thumbnailCachePolicy'
import type { ThumbnailCacheEntry as CacheFileEntry } from './thumbnailCachePolicy'
import { imageioThumbnail } from './imageioThumbnail'
import { sharpThumbnail } from './sharpThumbnail'
import { thumbnailBackend } from '../../config/thumbnailBackend'
import {
  GRID_THUMB_GLOBAL_SUBDIR,
  GRID_THUMB_JANITOR_MIN_INTERVAL_MS,
  GRID_THUMB_JANITOR_TARGET_RATIO,
  GRID_THUMB_JPEG_QUALITY,
  GRID_THUMB_MAX_CACHE_BYTES,
  GRID_THUMB_MAX_CACHE_FILES,
  GRID_THUMB_MIN_SOURCE_BYTES,
  GRID_THUMB_CACHE_FILENAME_HASH_HEX_CHARS,
  GRID_THUMB_FALLBACK_TARGET_EDGE_PX,
  GRID_THUMB_RESOLVE_MEMO_MAX,
  gridThumbCacheProfile,
  gridThumbDiskCacheExtension,
  normalizeThumbTierEdge
} from '../../config/gridThumb'

const RASTER_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.tif', '.tiff', '.avif', '.apng'])
const MACOS_RASTER_EXT = new Set([...RASTER_EXT, '.bmp', '.ico'])
// 图库和所有预览共享六个生成名额，避免各窗口叠加并发。
const generationLimit = 6

export type GridThumbResponse = { kind: 'thumb'; cacheFsPath: string } | { kind: 'original' }
export type FilmstripThumbResponse = { kind: 'thumb'; cacheFsPath: string } | { kind: 'original'; version: string }

let globalThumbRoot: string | null = null
/** `Uri.joinPath(globalStorageUri, GRID_THUMB_GLOBAL_SUBDIR)`, used by `asWebviewUri` to align with webview roots. */
let globalThumbBaseUri: Uri | null = null
let janitorLastRun = 0
let janitorScheduled = false
let janitorRunning = false
const generationInFlight = new Map<string, Promise<string | null>>()
const generationQueue: Array<() => Promise<void>> = []
let generationRunning = 0

/** Called during `activate`: ensure cache directory exists. */
export function initGridThumbGlobalStorage(context: ExtensionContext): void {
  globalThumbBaseUri = Uri.joinPath(context.globalStorageUri, GRID_THUMB_GLOBAL_SUBDIR)
  const root = globalThumbBaseUri.fsPath
  fs.mkdirSync(root, { recursive: true })
  globalThumbRoot = root
  // 老缓存即使这次只发生命中也要回收；延迟启动避免与首屏图片 I/O 争用。
  const startup = setTimeout(scheduleJanitor, 3000)
  const interval = setInterval(scheduleJanitor, GRID_THUMB_JANITOR_MIN_INTERVAL_MS)
  startup.unref()
  interval.unref()
  context.subscriptions.push({
    dispose: () => {
      clearTimeout(startup)
      clearInterval(interval)
    }
  })
}

/** Convert absolute cache path to a `Uri` rooted at `globalThumbBaseUri` (avoid direct `Uri.file` for hosts with stricter webview URI handling). */
export function cacheFsPathToThumbResourceUri(cacheFsPath: string): Uri | null {
  if (!globalThumbBaseUri || !globalThumbRoot) {
    return null
  }
  const rel = path.relative(globalThumbRoot, path.resolve(cacheFsPath))
  if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) {
    return null
  }
  const segments = rel.split(/[/\\]/).filter(Boolean)
  if (segments.length === 0) {
    return null
  }
  return Uri.joinPath(globalThumbBaseUri, ...segments)
}

function getGlobalThumbRoot(): string | null {
  return globalThumbRoot
}

/** Full SHA256 hex digest for stable identity; disk filename uses prefix + tier only. */
function cacheDigestFullHex(realPath: string, mtimeMs: number, sizeBytes: number, tier: number): string {
  const t = normalizeThumbTierEdge(tier)
  return createHash('sha256')
    .update(`${realPath}\0${mtimeMs}\0${sizeBytes}\0${gridThumbCacheProfile(t)}`, 'utf8')
    .digest('hex')
}

function cacheFilePathsForDigest(fullHex: string, tier: number): { shardDir: string; filePath: string } {
  const root = getGlobalThumbRoot()!
  const t = normalizeThumbTierEdge(tier)
  const prefix = fullHex.slice(0, GRID_THUMB_CACHE_FILENAME_HASH_HEX_CHARS)
  const shard = prefix.slice(0, 2)
  const shardDir = path.join(root, shard)
  const ext = gridThumbDiskCacheExtension()
  const filePath = path.join(shardDir, `${prefix}_${t}.${ext}`)
  return { shardDir, filePath }
}

function touchCacheFile(fsPath: string): void {
  const now = new Date()
  try {
    fs.utimesSync(fsPath, now, now)
  } catch {
    //
  }
}

const resolveThumbMemo = new Map<string, GridThumbResponse>()

function resolveThumbMemoKey(realPath: string, mtimeMs: number, size: number, targetTierEdge: number): string {
  const tier = normalizeThumbTierEdge(targetTierEdge)
  return `${realPath}\0${mtimeMs}\0${size}\0${gridThumbCacheProfile(tier)}`
}

function resolveThumbMemoGet(key: string): GridThumbResponse | undefined {
  const v = resolveThumbMemo.get(key)
  if (v === undefined) {
    return undefined
  }
  resolveThumbMemo.delete(key)
  resolveThumbMemo.set(key, v)
  return v
}

function resolveThumbMemoSet(key: string, value: GridThumbResponse): void {
  if (resolveThumbMemo.has(key)) {
    resolveThumbMemo.delete(key)
  }
  resolveThumbMemo.set(key, value)
  while (resolveThumbMemo.size > GRID_THUMB_RESOLVE_MEMO_MAX) {
    const oldest = resolveThumbMemo.keys().next().value as string
    resolveThumbMemo.delete(oldest)
  }
}

function extensionRoot(): string {
  const packaged =
    extensions.getExtension('vscode-infra.image-viewer') ?? extensions.all.find((e) => e.id.endsWith('.image-viewer'))

  if (packaged) {
    return packaged.extensionPath
  }

  const envRoot = utils.envVars?.extensionPath?.trim()
  if (envRoot) {
    return path.resolve(envRoot)
  }

  return path.resolve(__dirname, '..')
}

function isPathUnderRoot(file: string, root: string): boolean {
  const rel = path.relative(root, file)
  return rel === '' || (!rel.startsWith(`..${path.sep}`) && rel !== '..' && !path.isAbsolute(rel))
}

function isInWorkspace(absFile: string): boolean {
  const n = path.normalize(absFile)
  if (workspace.getWorkspaceFolder(Uri.file(n))) {
    return true
  }
  const folders = workspace.workspaceFolders
  if (!folders?.length) {
    return false
  }
  for (const f of folders) {
    const root = path.normalize(f.uri.fsPath)
    if (isPathUnderRoot(n, root)) {
      return true
    }
    try {
      const rootReal = fs.realpathSync.native?.(root) ?? fs.realpathSync(root)
      if (rootReal !== root && isPathUnderRoot(n, rootReal)) {
        return true
      }
      const fileReal = fs.realpathSync.native?.(n) ?? fs.realpathSync(n)
      if (isPathUnderRoot(fileReal, root) || (rootReal !== root && isPathUnderRoot(fileReal, rootReal))) {
        return true
      }
    } catch {
      //
    }
  }
  return false
}

function resolveExistingNormalizedPath(p: string): string | null {
  const n = path.normalize(p)
  if (!fs.existsSync(n)) {
    return null
  }
  try {
    return fs.realpathSync.native?.(n) ?? fs.realpathSync(n)
  } catch {
    return n
  }
}

function skipReasonByMeta(absPath: string, st: fs.Stats): string | null {
  const ext = path.extname(absPath).toLowerCase()
  if (!(process.platform === 'darwin' ? MACOS_RASTER_EXT : RASTER_EXT).has(ext)) {
    return `non-raster ext=${ext}`
  }
  if (st.size < GRID_THUMB_MIN_SOURCE_BYTES) {
    return `file too small for thumb bytes=${st.size} (min ${GRID_THUMB_MIN_SOURCE_BYTES})`
  }
  return null
}

async function rasterToJpegBufferByPath(absPath: string, tierEdge: number): Promise<Buffer> {
  const edge = normalizeThumbTierEdge(tierEdge)
  return thumbnailBackend() === 'imageio'
    ? imageioThumbnail(extensionRoot(), absPath, edge, GRID_THUMB_JPEG_QUALITY)
    : sharpThumbnail(extensionRoot(), absPath, edge, GRID_THUMB_JPEG_QUALITY)
}

/** Throttle concurrent `stat` calls while janitor lists cache directories. */
const GRID_THUMB_LIST_STAT_CONCURRENCY = 32

async function listGlobalCacheFiles(root: string): Promise<CacheFileEntry[]> {
  const paths: string[] = []
  let entries: string[]
  try {
    entries = await fs.promises.readdir(root)
  } catch {
    return []
  }
  for (const name of entries) {
    if (!/^[0-9a-f]{2}$/i.test(name)) {
      continue
    }
    const shard = path.join(root, name)
    let files: string[]
    try {
      files = await fs.promises.readdir(shard)
    } catch {
      continue
    }
    for (const f of files) {
      if (!f.endsWith('.jpg') && !f.endsWith('.png')) {
        continue
      }
      paths.push(path.join(shard, f))
    }
  }
  const out: CacheFileEntry[] = []
  for (let i = 0; i < paths.length; i += GRID_THUMB_LIST_STAT_CONCURRENCY) {
    const chunk = paths.slice(i, i + GRID_THUMB_LIST_STAT_CONCURRENCY)
    const rows = await Promise.all(
      chunk.map((fp) =>
        fs.promises
          .stat(fp)
          .then((st) => (st.isFile() ? { path: fp, size: st.size, mtimeMs: st.mtimeMs } : null))
          .catch(() => null)
      )
    )
    for (const row of rows) {
      if (row) {
        out.push(row)
      }
    }
  }
  return out
}

function scheduleJanitor(): void {
  if (janitorScheduled || janitorRunning || !getGlobalThumbRoot()) {
    return
  }
  janitorScheduled = true
  setImmediate(() => {
    janitorScheduled = false
    void runJanitor()
  })
}

async function runJanitor(): Promise<void> {
  const root = getGlobalThumbRoot()
  if (!root) {
    return
  }
  const now = Date.now()
  if (janitorRunning || now - janitorLastRun < GRID_THUMB_JANITOR_MIN_INTERVAL_MS) {
    return
  }
  janitorLastRun = now
  janitorRunning = true
  try {
    const files = await listGlobalCacheFiles(root)
    const victims = thumbnailEvictionCandidates(
      files,
      GRID_THUMB_MAX_CACHE_BYTES,
      GRID_THUMB_MAX_CACHE_FILES,
      GRID_THUMB_JANITOR_TARGET_RATIO
    )
    const removed = new Set<string>()
    for (let start = 0; start < victims.length; start += 16) {
      await Promise.all(
        victims.slice(start, start + 16).map((file) =>
          fs.promises
            .unlink(file.path)
            .then(() => {
              removed.add(file.path)
            })
            .catch(() => {})
        )
      )
    }
    // 磁盘淘汰必须同时失效 URL memo，否则滚回旧图片时会永久命中已删除路径。
    for (const [key, value] of resolveThumbMemo) {
      if (value.kind === 'thumb' && removed.has(value.cacheFsPath)) {
        resolveThumbMemo.delete(key)
      }
    }
  } catch {
    //
  } finally {
    janitorRunning = false
  }
}

function drainGenerationQueue(): void {
  while (generationRunning < generationLimit && generationQueue.length) {
    const run = generationQueue.shift()!
    generationRunning++
    void run().finally(() => {
      generationRunning--
      drainGenerationQueue()
    })
  }
}

async function ensureThumbOnDisk(realPath: string, st: fs.Stats, targetTierEdge: number): Promise<string | null> {
  const root = getGlobalThumbRoot()
  if (!root) {
    return null
  }
  const tier = normalizeThumbTierEdge(targetTierEdge)
  const fullHex = cacheDigestFullHex(realPath, st.mtimeMs, st.size, tier)
  const { shardDir, filePath } = cacheFilePathsForDigest(fullHex, tier)
  const existing = generationInFlight.get(filePath)
  if (existing) {
    return existing
  }
  if (fs.existsSync(filePath)) {
    touchCacheFile(filePath)
    return filePath
  }
  const task = new Promise<string | null>((resolve) => {
    generationQueue.push(async () => {
      try {
        const thumbBuf = await rasterToJpegBufferByPath(realPath, targetTierEdge)
        if (!thumbBuf || !thumbBuf.length) {
          resolve(null)
          return
        }
        await fs.promises.mkdir(shardDir, { recursive: true })
        await fs.promises.writeFile(filePath, thumbBuf)
        touchCacheFile(filePath)
        scheduleJanitor()
        resolve(filePath)
      } catch {
        resolve(null)
      }
    })
  })
  generationInFlight.set(filePath, task)
  drainGenerationQueue()
  try {
    return await task
  } finally {
    generationInFlight.delete(filePath)
  }
}

export async function resolveThumbForGrid(
  filePath: string,
  targetMaxEdgePx: number = GRID_THUMB_FALLBACK_TARGET_EDGE_PX
): Promise<GridThumbResponse> {
  const targetTierEdge = normalizeThumbTierEdge(targetMaxEdgePx)
  try {
    if (!filePath) {
      return { kind: 'original' }
    }
    if (!getGlobalThumbRoot()) {
      return { kind: 'original' }
    }
    const normalized = path.normalize(filePath)
    const realPath = resolveExistingNormalizedPath(normalized)
    if (!realPath) {
      return { kind: 'original' }
    }
    if (!isInWorkspace(realPath)) {
      return { kind: 'original' }
    }
    const st = fs.statSync(realPath)
    const metaReason = skipReasonByMeta(realPath, st)
    if (!st.isFile()) {
      return { kind: 'original' }
    }
    if (metaReason) {
      return { kind: 'original' }
    }

    const memoKey = resolveThumbMemoKey(realPath, st.mtimeMs, st.size, targetTierEdge)
    const memoHit = resolveThumbMemoGet(memoKey)
    if (memoHit) {
      if (memoHit.kind === 'original') {
        return memoHit
      }
      if (fs.existsSync(memoHit.cacheFsPath)) {
        touchCacheFile(memoHit.cacheFsPath)
        return memoHit
      }
      resolveThumbMemo.delete(memoKey)
    }

    const cachePath = await ensureThumbOnDisk(realPath, st, targetTierEdge)
    if (!cachePath) {
      const r: GridThumbResponse = { kind: 'original' }
      resolveThumbMemoSet(memoKey, r)
      return r
    }
    const thumb: GridThumbResponse = { kind: 'thumb', cacheFsPath: cachePath }
    resolveThumbMemoSet(memoKey, thumb)
    return thumb
  } catch {
    return { kind: 'original' }
  }
}

/** Read bounded image headers asynchronously; unknown dimensions never authorize direct raster display. */
async function isSmallFilmstripImage(filePath: string): Promise<boolean> {
  const dimensions = await readImageDimensions(filePath)
  const sizes = dimensions?.images?.length ? dimensions.images : [dimensions]
  return !!dimensions && dimensions.type !== 'tiff' && sizes.every((size) => size && Number.isFinite(size.width) && Number.isFinite(size.height)
    && size.width > 0 && size.height > 0 && size.width <= 200 && size.height <= 200)
}

/** Caller authorizes the file. Original is an explicit SVG/small-pixel choice, never a decode-failure fallback. */
export async function resolveFilmstripThumbnail(authorizedPath: string): Promise<FilmstripThumbResponse | null> {
  try {
    const realPath = await fs.promises.realpath(authorizedPath)
    const stat = await fs.promises.stat(realPath)
    if (!stat.isFile()) { return null }
    if (path.extname(realPath).toLowerCase() === '.svg' || await isSmallFilmstripImage(realPath)) {
      return { kind: 'original', version: `${stat.mtimeMs}-${stat.size}` }
    }
    // Compressed byte count does not bound decoded pixels. Large rasters always use the 200px cache.
    const cacheFsPath = await ensureThumbOnDisk(realPath, stat, 200)
    return cacheFsPath ? { kind: 'thumb', cacheFsPath } : null
  } catch { return null }
}
