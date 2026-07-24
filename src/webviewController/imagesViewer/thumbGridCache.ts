/** Grid thumbnails: small files in globalStorage (JPEG by default on macOS via `sips`; PNG in raw-QL experimental mode) served through `asWebviewUri`. */
/* eslint-disable @typescript-eslint/no-var-requires */
import { execFile } from 'child_process'
import { createHash } from 'crypto'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { promisify } from 'util'
import imageSize from 'image-size'
import { ExtensionContext, Uri, workspace, extensions } from 'vscode'
import {
  GRID_THUMB_GLOBAL_SUBDIR,
  GRID_THUMB_JANITOR_MIN_INTERVAL_MS,
  GRID_THUMB_JANITOR_TARGET_RATIO,
  GRID_THUMB_JPEG_DECODE_MAX_MEMORY_MB,
  GRID_THUMB_JPEG_QUALITY,
  GRID_THUMB_MACOS_USE_SIPS,
  GRID_THUMB_MACOS_USE_QUICKLOOK,
  GRID_THUMB_MACOS_QUICKLOOK_RAW_PNG,
  GRID_THUMB_MAX_CACHE_BYTES,
  GRID_THUMB_MAX_CACHE_FILES,
  GRID_THUMB_MIN_SOURCE_BYTES,
  GRID_THUMB_CACHE_FILENAME_HASH_HEX_CHARS,
  GRID_THUMB_FALLBACK_TARGET_EDGE_PX,
  GRID_THUMB_RASTER_EXTENSIONS,
  GRID_THUMB_RESOLVE_MEMO_MAX,
  gridThumbCacheProfile,
  gridThumbDiskCacheExtension,
  gridThumbMacQlIntermediatePx,
  normalizeThumbTierEdge
} from '../../config/gridThumb'

const execFileAsync = promisify(execFile)

const MACOS_QLMANAGE = '/usr/bin/qlmanage'
const MACOS_SIPS = '/usr/bin/sips'

const RASTER_EXT = new Set<string>(GRID_THUMB_RASTER_EXTENSIONS)

export type GridThumbResponse =
  | { kind: 'thumb'; cacheFsPath: string }
  | { kind: 'original' }

let globalThumbRoot: string | null = null
let extensionRootPath: string | null = null
/** `Uri.joinPath(globalStorageUri, GRID_THUMB_GLOBAL_SUBDIR)`, used by `asWebviewUri` to align with webview roots. */
let globalThumbBaseUri: Uri | null = null
let janitorLastRun = 0
let janitorScheduled = false

/** Called during `activate`: ensure cache directory exists. */
export function initGridThumbGlobalStorage(context: ExtensionContext): void {
  globalThumbBaseUri = Uri.joinPath(context.globalStorageUri, GRID_THUMB_GLOBAL_SUBDIR)
  const root = globalThumbBaseUri.fsPath
  fs.mkdirSync(root, { recursive: true })
  globalThumbRoot = root
  extensionRootPath = context.extensionPath
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

/** Read image header via `image-size`; cap target edge to source max edge to avoid upscaled blur. */
function decodeBoxEdgeClampedToOriginal(absPath: string, tierEdge: number): number {
  const cap = normalizeThumbTierEdge(tierEdge)
  try {
    const dim = imageSize(absPath) as { width?: number; height?: number }
    if (dim.width && dim.height && dim.width > 0 && dim.height > 0) {
      const origMax = Math.max(dim.width, dim.height)
      return Math.min(cap, origMax)
    }
  } catch {
    //
  }
  return cap
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
    extensions.getExtension('vscode-infra.image-viewer') ??
    extensions.all.find((e) => e.id.endsWith('.image-viewer'))

  if (packaged) {
    return packaged.extensionPath
  }

  if (extensionRootPath) {
    return path.resolve(extensionRootPath)
  }

  return path.resolve(__dirname, '..')
}

function wasmDir(): string {
  return path.join(extensionRoot(), 'dist', 'wasm')
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
  if (!RASTER_EXT.has(ext)) {
    return `non-raster ext=${ext}`
  }
  if (st.size < GRID_THUMB_MIN_SOURCE_BYTES) {
    return `file too small for thumb bytes=${st.size} (min ${GRID_THUMB_MIN_SOURCE_BYTES})`
  }
  return null
}

function resolveJimp(): { read: (...args: unknown[]) => Promise<unknown>; MIME_JPEG: string } {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let m: any = require('jimp')
  for (let d = 0; d < 4 && m; d++) {
    if (typeof m.read === 'function') {
      return m
    }
    m = m.default
  }
  throw new TypeError('Jimp.read is not a function (jimp interop / bundle shape)')
}

let jpegDecodeMemoryPatched = false

function ensureJpegDecodeMemoryLimitMb(minMb: number): void {
  if (jpegDecodeMemoryPatched) {
    return
  }
  jpegDecodeMemoryPatched = true
  try {
    const jpegJs = require('jpeg-js') as {
      decode: (data: Buffer, opts?: Record<string, unknown>) => unknown
    }
    const originalDecode = jpegJs.decode
    if (typeof originalDecode !== 'function') {
      return
    }
    jpegJs.decode = (data: Buffer, userOpts?: Record<string, unknown>) => {
      const prev =
        userOpts && typeof userOpts.maxMemoryUsageInMB === 'number' ? userOpts.maxMemoryUsageInMB : 0
      return originalDecode(data, {
        ...userOpts,
        maxMemoryUsageInMB: Math.max(prev, minMb)
      })
    }
  } catch {
    //
  }
}

async function rasterToJpegBuffer(absPath: string, tierEdge: number): Promise<Buffer> {
  const box = decodeBoxEdgeClampedToOriginal(absPath, tierEdge)
  ensureJpegDecodeMemoryLimitMb(GRID_THUMB_JPEG_DECODE_MAX_MEMORY_MB)
  const Jimp = resolveJimp()
  const img = (await Jimp.read(absPath)) as {
    scaleToFit: (w: number, h: number) => void
    quality: (n: number) => { getBufferAsync: (mime: string) => Promise<Buffer> }
  }
  img.scaleToFit(box, box)
  return img.quality(GRID_THUMB_JPEG_QUALITY).getBufferAsync(Jimp.MIME_JPEG)
}

async function macosSipsToJpegBuffer(absPath: string, tierEdge: number): Promise<Buffer | null> {
  if (process.platform !== 'darwin' || !GRID_THUMB_MACOS_USE_SIPS) {
    return null
  }
  if (!fs.existsSync(MACOS_SIPS)) {
    return null
  }
  const box = decodeBoxEdgeClampedToOriginal(absPath, tierEdge)
  if (!Number.isFinite(box) || box <= 0) {
    return null
  }
  const tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'iv-grid-sips-'))
  const outJpg = path.join(tmpDir, 'thumb.jpg')
  try {
    await execFileAsync(
      MACOS_SIPS,
      [
        '-Z',
        String(Math.round(box)),
        '-s',
        'format',
        'jpeg',
        '-s',
        'formatOptions',
        String(GRID_THUMB_JPEG_QUALITY),
        '-o',
        outJpg,
        absPath
      ],
      {
        timeout: 25_000,
        maxBuffer: 32 * 1024 * 1024
      }
    )
    if (!fs.existsSync(outJpg)) {
      return null
    }
    const buf = await fs.promises.readFile(outJpg)
    return buf.length > 0 ? buf : null
  } catch {
    return null
  } finally {
    await fs.promises.rm(tmpDir, { recursive: true, force: true }).catch(() => {})
  }
}

async function macosQlmanageThumbnailPng(absPath: string, sizePx: number): Promise<Buffer | null> {
  if (process.platform !== 'darwin') {
    return null
  }
  if (!fs.existsSync(MACOS_QLMANAGE)) {
    return null
  }
  const tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'iv-grid-ql-'))
  try {
    await execFileAsync(
      MACOS_QLMANAGE,
      ['-t', '-s', String(sizePx), '-o', tmpDir, absPath],
      {
        timeout: 25_000,
        maxBuffer: 8 * 1024 * 1024
      }
    )
    const outPng = path.join(tmpDir, path.basename(absPath) + '.png')
    if (!fs.existsSync(outPng)) {
      return null
    }
    const pngBuf = await fs.promises.readFile(outPng)
    return pngBuf.length > 0 ? pngBuf : null
  } catch {
    return null
  } finally {
    await fs.promises.rm(tmpDir, { recursive: true, force: true }).catch(() => {})
  }
}

async function macosQuickLookToJpegBuffer(absPath: string, tierEdge: number): Promise<Buffer | null> {
  if (process.platform !== 'darwin' || !GRID_THUMB_MACOS_USE_QUICKLOOK) {
    return null
  }
  const qlPx = gridThumbMacQlIntermediatePx(tierEdge)
  const pngBuf = await macosQlmanageThumbnailPng(absPath, qlPx)
  if (!pngBuf) {
    return null
  }
  try {
    const box = decodeBoxEdgeClampedToOriginal(absPath, tierEdge)
    ensureJpegDecodeMemoryLimitMb(GRID_THUMB_JPEG_DECODE_MAX_MEMORY_MB)
    const Jimp = resolveJimp()
    const img = (await Jimp.read(pngBuf)) as {
      scaleToFit: (w: number, h: number) => void
      quality: (n: number) => { getBufferAsync: (mime: string) => Promise<Buffer> }
    }
    img.scaleToFit(box, box)
    return img.quality(GRID_THUMB_JPEG_QUALITY).getBufferAsync(Jimp.MIME_JPEG)
  } catch {
    return null
  }
}

type WebpDecodeModule = typeof import('@jsquash/webp/decode')
let webpDecodeModPromise: Promise<WebpDecodeModule> | null = null

async function getWebpDecode(): Promise<WebpDecodeModule> {
  if (!webpDecodeModPromise) {
    webpDecodeModPromise = (async () => {
      const wasmDisk = path.join(wasmDir(), 'webp_dec.wasm')
      if (!fs.existsSync(wasmDisk)) {
        throw new Error(`webp_dec.wasm missing (copy webpack plugin): ${wasmDisk}`)
      }
      const wasmBytes = fs.readFileSync(wasmDisk)
      const wasmCompiled = await WebAssembly.compile(wasmBytes)
      const mod = (await import('@jsquash/webp/decode')) as WebpDecodeModule
      await mod.init(wasmCompiled)
      return mod
    })()
  }
  return webpDecodeModPromise
}

async function rasterToJpegBufferWebp(absPath: string, tierEdge: number): Promise<Buffer | null> {
  const box = decodeBoxEdgeClampedToOriginal(absPath, tierEdge)
  ensureJpegDecodeMemoryLimitMb(GRID_THUMB_JPEG_DECODE_MAX_MEMORY_MB)
  try {
    const { default: decodeWebp } = await getWebpDecode()
    const raw = fs.readFileSync(absPath)
    const ab = raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength)
    const imageData = await decodeWebp(ab)
    const JimpMod = resolveJimp()
    type JimpThumb = {
      bitmap: { data: Buffer }
      scaleToFit: (w: number, h: number) => void
      quality: (n: number) => { getBufferAsync: (mime: string) => Promise<Buffer> }
    }
    const img = await new Promise<JimpThumb>((resolve, reject) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      new (JimpMod as any)(imageData.width, imageData.height, (err: Error | null, image: unknown) => {
        if (err || !image) {
          reject(err ?? new Error('Jimp empty'))
          return
        }
        resolve(image as JimpThumb)
      })
    })
    img.bitmap.data.set(imageData.data)
    img.scaleToFit(box, box)
    return img.quality(GRID_THUMB_JPEG_QUALITY).getBufferAsync(JimpMod.MIME_JPEG)
  } catch {
    return null
  }
}

async function rasterToJpegBufferByPath(absPath: string, tierEdge: number): Promise<Buffer | null> {
  if (
    process.platform === 'darwin' &&
    GRID_THUMB_MACOS_USE_QUICKLOOK &&
    GRID_THUMB_MACOS_QUICKLOOK_RAW_PNG
  ) {
    const box = decodeBoxEdgeClampedToOriginal(absPath, tierEdge)
    const pngBuf = await macosQlmanageThumbnailPng(absPath, box)
    return pngBuf && pngBuf.length > 0 ? pngBuf : null
  }

  const sipsBuf = await macosSipsToJpegBuffer(absPath, tierEdge)
  if (sipsBuf && sipsBuf.length > 0) {
    return sipsBuf
  }

  const macBuf = await macosQuickLookToJpegBuffer(absPath, tierEdge)
  if (macBuf && macBuf.length > 0) {
    return macBuf
  }
  const ext = path.extname(absPath).toLowerCase()
  if (ext === '.webp') {
    return rasterToJpegBufferWebp(absPath, tierEdge)
  }
  try {
    return await rasterToJpegBuffer(absPath, tierEdge)
  } catch {
    return null
  }
}

interface CacheFileEntry {
  path: string
  size: number
  mtimeMs: number
}

/** Throttle concurrent `stat` calls while janitor lists cache directories. */
const GRID_THUMB_LIST_STAT_CONCURRENCY = 256

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
        fs.promises.stat(fp).then((st) => (st.isFile() ? { path: fp, size: st.size, mtimeMs: st.mtimeMs } : null))
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
  if (janitorScheduled || !getGlobalThumbRoot()) {
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
  if (now - janitorLastRun < GRID_THUMB_JANITOR_MIN_INTERVAL_MS) {
    return
  }
  janitorLastRun = now
  try {
    const files = await listGlobalCacheFiles(root)
    let totalBytes = files.reduce((s, f) => s + f.size, 0)
    if (totalBytes <= GRID_THUMB_MAX_CACHE_BYTES && files.length <= GRID_THUMB_MAX_CACHE_FILES) {
      return
    }
    const sorted = [...files].sort((a, b) => a.mtimeMs - b.mtimeMs)
    const byteTarget = GRID_THUMB_MAX_CACHE_BYTES * GRID_THUMB_JANITOR_TARGET_RATIO
    const countTarget = Math.floor(GRID_THUMB_MAX_CACHE_FILES * GRID_THUMB_JANITOR_TARGET_RATIO)
    let remaining = sorted.length
    const toUnlink: string[] = []
    for (const f of sorted) {
      if (totalBytes <= byteTarget && remaining <= countTarget) {
        break
      }
      toUnlink.push(f.path)
      totalBytes -= f.size
      remaining--
    }
    await Promise.all(toUnlink.map((p) => fs.promises.unlink(p).catch(() => {})))
  } catch {
    //
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
  if (fs.existsSync(filePath)) {
    touchCacheFile(filePath)
    return filePath
  }
  const thumbBuf = await rasterToJpegBufferByPath(realPath, targetTierEdge)
  if (!thumbBuf || thumbBuf.length === 0) {
    return null
  }
  fs.mkdirSync(shardDir, { recursive: true })
  await fs.promises.writeFile(filePath, thumbBuf)
  touchCacheFile(filePath)
  scheduleJanitor()
  return filePath
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
      return memoHit
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
