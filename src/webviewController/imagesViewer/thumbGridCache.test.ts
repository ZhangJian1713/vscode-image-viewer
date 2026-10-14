import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { createHash } from 'crypto'
import { setTimeout as realSetTimeout } from 'timers'
import { initGridThumbGlobalStorage, resolveThumbForGrid } from './thumbGridCache'
import { imageioThumbnail } from './imageioThumbnail'
import { sharpThumbnail } from './sharpThumbnail'
import { thumbnailBackend } from '../../config/thumbnailBackend'
import {
  GRID_THUMB_GLOBAL_SUBDIR,
  GRID_THUMB_CACHE_FILENAME_HASH_HEX_CHARS,
  gridThumbCacheProfile
} from '../../config/gridThumb'

jest.mock('@easy_vscode/core', () => ({ utils: { envVars: { extensionPath: '/unused-fixture' } } }))
jest.mock(
  'vscode',
  () => ({
    Uri: {
      file: (fsPath: string) => ({ fsPath }),
      joinPath: (uri: { fsPath: string }, ...parts: string[]) => ({
        fsPath: require('path').join(uri.fsPath, ...parts)
      })
    },
    workspace: { getWorkspaceFolder: () => ({ uri: { fsPath: '/fixture' } }) },
    extensions: { getExtension: () => undefined, all: [] }
  }),
  { virtual: true }
)
jest.mock('./imageioThumbnail', () => ({ imageioThumbnail: jest.fn().mockRejectedValue(new Error('Invalid fixture')) }))
jest.mock('./sharpThumbnail', () => ({ sharpThumbnail: jest.fn().mockRejectedValue(new Error('Invalid fixture')) }))
jest.mock('../../config/thumbnailBackend', () => ({ thumbnailBackend: jest.fn(() => 'imageio') }))

test('startup cleanup trims existing disk files and a memo hit never returns an evicted file', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'image-gallery-cache-'))
  const subscriptions: Array<{ dispose: () => void }> = []
  try {
    const source = path.join(root, 'source.jpg')
    fs.writeFileSync(source, Buffer.alloc(128 * 1024))
    const stat = fs.statSync(source)
    const digest = createHash('sha256')
      .update(`${fs.realpathSync(source)}\0${stat.mtimeMs}\0${stat.size}\0${gridThumbCacheProfile(200)}`)
      .digest('hex')
    const cacheRoot = path.join(root, GRID_THUMB_GLOBAL_SUBDIR)
    const shard = path.join(cacheRoot, digest.slice(0, 2))
    fs.mkdirSync(shard, { recursive: true })
    const cached = path.join(shard, `${digest.slice(0, GRID_THUMB_CACHE_FILENAME_HASH_HEX_CHARS)}_200.jpg`)
    const newer = path.join(shard, 'newer_200.jpg')
    fs.writeFileSync(cached, '')
    fs.writeFileSync(newer, '')
    // Sparse fixtures exercise logical byte limits without allocating hundreds of MB of real data.
    fs.truncateSync(cached, 400 * 1024 * 1024)
    fs.truncateSync(newer, 200 * 1024 * 1024)
    initGridThumbGlobalStorage({ globalStorageUri: { fsPath: root }, subscriptions } as any)
    expect(await resolveThumbForGrid(source, 200)).toEqual({ kind: 'thumb', cacheFsPath: cached })
    fs.utimesSync(cached, 1, 1)
    fs.utimesSync(newer, 2, 2)
    for (let attempt = 0; attempt < 160 && fs.existsSync(cached); attempt++) {
      await new Promise((resolve) => realSetTimeout(resolve, 25))
    }
    expect(fs.existsSync(cached)).toBe(false)
    expect(fs.existsSync(newer)).toBe(true)
    // The invalid fixture cannot regenerate, so fallback is valid; a dead cached URL is not.
    expect(await resolveThumbForGrid(source, 200)).toEqual({ kind: 'original' })
  } finally {
    subscriptions.forEach((subscription) => subscription.dispose())
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('ImageIO generation stays bounded, deduplicates requests, and caches each successful result', async () => {
  if (process.platform !== 'darwin') {
    return
  }
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'image-gallery-generation-'))
  const subscriptions: Array<{ dispose: () => void }> = []
  const native = imageioThumbnail as jest.MockedFunction<typeof imageioThumbnail>
  native.mockClear()
  let release: () => void
  const gate = new Promise<void>((resolve) => { release = resolve })
  let running = 0, maximum = 0
  native.mockImplementation(async () => {
    maximum = Math.max(maximum, ++running)
    try {
      await gate
      return Buffer.from([0xff, 0xd8, 0xff, 0xd9])
    } finally {
      running--
    }
  })
  try {
    initGridThumbGlobalStorage({ globalStorageUri: { fsPath: root }, subscriptions } as any)
    const sources = Array.from({ length: 8 }, (_, index) => path.join(root, `source-${index}.jpg`))
    sources.forEach((source) => fs.writeFileSync(source, Buffer.alloc(128 * 1024)))
    const tasks = sources.map((source) => resolveThumbForGrid(source, 200))
    const duplicate = resolveThumbForGrid(sources[0], 200)
    const limit = Math.max(1, Math.min(4, os.cpus().length - 1))
    expect(native).toHaveBeenCalledTimes(limit)
    release!()
    const results = await Promise.all([...tasks, duplicate])
    expect(native).toHaveBeenCalledTimes(8)
    expect(maximum).toBe(limit)
    expect(results[8]).toEqual(results[0])
    expect(results.every((result) => result.kind === 'thumb')).toBe(true)
    expect(await resolveThumbForGrid(sources[0], 200)).toEqual(results[0])
    expect(native).toHaveBeenCalledTimes(8)
    native.mockRejectedValue(new Error('ImageIO failed'))
    const unsupported = path.join(root, 'corrupt.tiff')
    fs.writeFileSync(unsupported, Buffer.alloc(128 * 1024))
    expect(await resolveThumbForGrid(unsupported, 200)).toEqual({ kind: 'original' })
    expect(native).toHaveBeenLastCalledWith('/unused-fixture', fs.realpathSync(unsupported), 200, 78)
    expect(sharpThumbnail).not.toHaveBeenCalled()
  } finally {
    release!()
    subscriptions.forEach((subscription) => subscription.dispose())
    fs.rmSync(root, { recursive: true, force: true })
    native.mockRejectedValue(new Error('Invalid fixture'))
  }
})

test('the Sharp branch generates and caches once, and decode failure returns the original', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'image-gallery-sharp-'))
  const subscriptions: Array<{ dispose: () => void }> = []
  const native = sharpThumbnail as jest.MockedFunction<typeof sharpThumbnail>
  const choice = thumbnailBackend as jest.MockedFunction<typeof thumbnailBackend>
  choice.mockReturnValue('sharp')
  native.mockClear()
  native.mockResolvedValue(Buffer.from([0xff, 0xd8, 0xff, 0xd9]))
  try {
    initGridThumbGlobalStorage({ globalStorageUri: { fsPath: root }, subscriptions } as any)
    const source = path.join(root, 'source.webp')
    fs.writeFileSync(source, Buffer.alloc(128 * 1024))
    const result = await resolveThumbForGrid(source, 400)
    expect(result.kind).toBe('thumb')
    expect(await resolveThumbForGrid(source, 400)).toEqual(result)
    expect(native).toHaveBeenCalledTimes(1)
    expect(native).toHaveBeenLastCalledWith('/unused-fixture', fs.realpathSync(source), 400, 78)
    native.mockRejectedValue(new Error('Decode failure'))
    const invalid = path.join(root, 'invalid.webp')
    fs.writeFileSync(invalid, Buffer.alloc(128 * 1024))
    expect(await resolveThumbForGrid(invalid, 400)).toEqual({ kind: 'original' })
  } finally {
    choice.mockReturnValue('imageio')
    native.mockRejectedValue(new Error('Invalid fixture'))
    subscriptions.forEach(subscription => subscription.dispose())
    fs.rmSync(root, { recursive: true, force: true })
  }
})
