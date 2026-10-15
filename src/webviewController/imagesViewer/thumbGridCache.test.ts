import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { createHash } from 'crypto'
import { setTimeout as realSetTimeout } from 'timers'
import { initGridThumbGlobalStorage, resolveThumbForGrid, resolveFilmstripThumbnail } from './thumbGridCache'
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
    const limit = 6
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


test('filmstrip generates 200px for small-byte sources with unknown/large dimensions and shares cached output', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'filmstrip-small-'))
  const subscriptions: Array<{ dispose: () => void }> = []
  try {
    initGridThumbGlobalStorage({ globalStorageUri: { fsPath: root }, subscriptions } as any)
    const source = path.join(root, 'tiny.png')
    fs.writeFileSync(source, 'small-source')
    const backend = (thumbnailBackend() === 'imageio' ? imageioThumbnail : sharpThumbnail) as jest.Mock
    backend.mockResolvedValueOnce(Buffer.from('generated-thumbnail'))
    const first = await resolveFilmstripThumbnail(source)
    expect(first).toEqual({ kind: 'thumb', cacheFsPath: expect.stringMatching(/_200\.jpg$/) })
    expect(backend).toHaveBeenLastCalledWith(expect.any(String), fs.realpathSync(source), 200, 78)
    const calls = backend.mock.calls.length
    expect(await resolveFilmstripThumbnail(source)).toEqual(first)
    expect(backend).toHaveBeenCalledTimes(calls)
    expect(await resolveThumbForGrid(source, 200)).toEqual({ kind: 'original' })
  } finally {
    subscriptions.forEach((entry) => entry.dispose())
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('shared thumbnail generation allows exactly six in flight and coalesces duplicates', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'filmstrip-concurrency-'))
  const subscriptions: Array<{ dispose: () => void }> = []
  const completions: Array<() => void> = []
  try {
    initGridThumbGlobalStorage({ globalStorageUri: { fsPath: root }, subscriptions } as any)
    const backend = (thumbnailBackend() === 'imageio' ? imageioThumbnail : sharpThumbnail) as jest.Mock
    backend.mockImplementation(() => new Promise((resolve) => completions.push(() => resolve(Buffer.from('thumb')))))
    const sources = Array.from({ length: 9 }, (_, i) => path.join(root, `${i}.jpg`))
    sources.forEach((file) => fs.writeFileSync(file, 'tiny'))
    const requests = sources.map((file) => resolveFilmstripThumbnail(file))
    requests.push(resolveFilmstripThumbnail(sources[0]))
    for (let i = 0; i < 100 && completions.length < 6; i++) { await new Promise((resolve) => realSetTimeout(resolve, 5)) }
    expect(completions).toHaveLength(6)
    completions[0]()
    for (let i = 0; i < 100 && completions.length < 7; i++) { await new Promise((resolve) => realSetTimeout(resolve, 5)) }
    expect(completions).toHaveLength(7)
    completions.slice(1).forEach((finish) => finish())
    for (let i = 0; i < 100 && completions.length < 9; i++) { await new Promise((resolve) => realSetTimeout(resolve, 5)) }
    completions.slice(7).forEach((finish) => finish())
    const outputs = await Promise.all(requests)
    expect(outputs.every(Boolean)).toBe(true)
    expect(outputs[0]).toEqual(outputs[9])
    expect(completions).toHaveLength(9)
  } finally {
    subscriptions.forEach((entry) => entry.dispose())
    fs.rmSync(root, { recursive: true, force: true })
  }
})


test('filmstrip uses original SVG and rasters up to 200px without generating cache files', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'filmstrip-direct-'))
  const subscriptions: Array<{ dispose: () => void }> = []
  const backend = (thumbnailBackend() === 'imageio' ? imageioThumbnail : sharpThumbnail) as jest.Mock
  const Jimp = require('jimp')
  try {
    initGridThumbGlobalStorage({ globalStorageUri: { fsPath: root }, subscriptions } as any)
    backend.mockClear()
    const svg = path.join(root, 'vector.SVG')
    fs.writeFileSync(svg, '<svg xmlns="http://www.w3.org/2000/svg" width="4000" height="3000"/>')
    const small = path.join(root, '40x20.png')
    await new Jimp(40, 20, 0x336699ff).writeAsync(small)
    const boundary = path.join(root, '200x100.png')
    await new Jimp(200, 100, 0x336699ff).writeAsync(boundary)
    for (const file of [svg, small, boundary]) {
      expect(await resolveFilmstripThumbnail(file)).toEqual({ kind: 'original' })
    }
    expect(backend).not.toHaveBeenCalled()
    const large = path.join(root, '201x20.png')
    await new Jimp(201, 20, 0x336699ff).writeAsync(large)
    expect(fs.statSync(large).size).toBeLessThan(120 * 1024)
    backend.mockResolvedValueOnce(Buffer.from('generated'))
    expect(await resolveFilmstripThumbnail(large)).toEqual({ kind: 'thumb', cacheFsPath: expect.stringMatching(/_200\.jpg$/) })
    expect(backend).toHaveBeenCalledTimes(1)
    expect(backend).toHaveBeenLastCalledWith(expect.any(String), fs.realpathSync(large), 200, 78)
    backend.mockRejectedValueOnce(new Error('Cannot decode'))
    const broken = path.join(root, 'broken.png')
    fs.writeFileSync(broken, 'not an image')
    expect(await resolveFilmstripThumbnail(broken)).toBeNull()
  } finally {
    subscriptions.forEach((entry) => entry.dispose())
    fs.rmSync(root, { recursive: true, force: true })
  }
})
