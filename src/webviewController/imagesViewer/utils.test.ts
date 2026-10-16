import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { getAllImgs } from './utils'
import { readLocalConfigFile } from './config'

let mockProjectRoot = ''
jest.mock('@easy_vscode/core', () => ({ utils: { getProjectPath: () => mockProjectRoot } }))
jest.mock('vscode', () => ({ Uri: { file: (fsPath: string) => ({ fsPath, toString: () => fsPath }) } }), {
  virtual: true
})
jest.mock('./config', () => ({ readLocalConfigFile: jest.fn() }))

const mockConfig = readLocalConfigFile as jest.Mock
const webview = { asWebviewUri: (uri) => ({ with: ({ query }) => ({ toString: () => `${uri.fsPath}?${query}` }) }) } as any

beforeEach(() => {
  mockProjectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'image-gallery-scan-'))
  mockConfig.mockReturnValue({ includeFolders: [], excludeFolders: [] })
  for (const relative of [
    'root.JPG',
    'assets/icons/a.svg',
    'assets/icons/child/b.png',
    'assets/photos/c.jpg',
    'assets/._sidecar.jpg',
    'node_modules/ignored.png'
  ]) {
    fs.mkdirSync(path.dirname(path.join(mockProjectRoot, relative)), { recursive: true })
    fs.writeFileSync(path.join(mockProjectRoot, relative), 'fixture')
  }
})
afterEach(() => fs.rmSync(mockProjectRoot, { recursive: true, force: true }))

test('async scanning preserves image metadata, uppercase formats and project-relative paths', async () => {
  const images = await getAllImgs(webview)
  expect(images.map((image) => image.path).sort()).toEqual([
    '/assets/icons/a.svg',
    '/assets/icons/child/b.png',
    '/assets/photos/c.jpg',
    '/root.JPG'
  ])
  expect(images.every((image) => image.size === 7 && image.mtimeMs > 0)).toBe(true)
})

test('unchanged images keep their URLs while overwritten originals receive new resource versions', async () => {
  const before = await getAllImgs(webview)
  expect((await getAllImgs(webview)).map((image) => image.vscodePath)).toEqual(before.map((image) => image.vscodePath))
  const original = before.find((image) => image.path === '/assets/icons/a.svg')!
  fs.writeFileSync(original.fullPath, 'updated SVG content')
  const updated = (await getAllImgs(webview)).find((image) => image.path === original.path)!
  expect(updated.vscodePath).not.toBe(original.vscodePath)
  expect(updated.vscodePath).toBe(`${updated.fullPath}?v=${updated.mtimeMs}-${updated.size}`)
})

test('scoped scans exclude siblings and exclusions still apply to a directly requested subtree', async () => {
  const scope = path.join(mockProjectRoot, 'assets/icons')
  expect(await getAllImgs(webview, scope)).toHaveLength(2)
  mockConfig.mockReturnValue({ includeFolders: [], excludeFolders: ['assets/icons'] })
  expect(await getAllImgs(webview, path.join(scope, 'child'))).toEqual([])
})

test('new scan cancellation and unreadable roots are distinguishable from an empty folder', async () => {
  await expect(getAllImgs(webview, null, { cancelled: true })).rejects.toThrow('Scan cancelled')
  await expect(getAllImgs(webview, path.join(mockProjectRoot, 'missing'))).rejects.toThrow('Unable to read')
})

test('directory symlinks do not recurse outside the workspace or create cycles', async () => {
  fs.symlinkSync(mockProjectRoot, path.join(mockProjectRoot, 'cycle'), 'dir')
  expect(await getAllImgs(webview)).toHaveLength(4)
})

test('Glob includes and excludes compose while unrelated roots are never read', async () => {
  mockConfig.mockReturnValue({ includeFolders: ['assets/{icons,photos}'], excludeFolders: ['**/child/**'] })
  const readdir = jest.spyOn(fs.promises, 'readdir')
  try {
    expect((await getAllImgs(webview)).map((image) => image.path).sort()).toEqual([
      '/assets/icons/a.svg',
      '/assets/photos/c.jpg'
    ])
    const visited = readdir.mock.calls.map(([directory]) => String(directory))
    expect(visited).not.toContain(path.join(mockProjectRoot, 'assets/icons/child'))
    expect(visited).not.toContain(path.join(mockProjectRoot, 'node_modules'))
  } finally {
    readdir.mockRestore()
  }
})

test('literal includes start at the selected prefix and scoped scans intersect include rules', async () => {
  mockConfig.mockReturnValue({ includeFolders: ['assets/icons/**'], excludeFolders: [] })
  const readdir = jest.spyOn(fs.promises, 'readdir')
  try {
    expect(await getAllImgs(webview)).toHaveLength(2)
    expect(readdir.mock.calls.some(([directory]) => directory === mockProjectRoot)).toBe(false)
    expect(await getAllImgs(webview, path.join(mockProjectRoot, 'assets/photos'))).toEqual([])
    expect(await getAllImgs(webview, path.join(mockProjectRoot, 'assets/icons/child'))).toHaveLength(1)
  } finally {
    readdir.mockRestore()
  }
})

test('invalid rules fail before reading the filesystem', async () => {
  mockConfig.mockReturnValue({ includeFolders: ['assets/[bad'], excludeFolders: [] })
  const readdir = jest.spyOn(fs.promises, 'readdir')
  try {
    await expect(getAllImgs(webview)).rejects.toThrow('invalid Glob')
    expect(readdir).not.toHaveBeenCalled()
  } finally {
    readdir.mockRestore()
  }
})

test('include prefixes cannot follow a directory symlink outside the workspace', async () => {
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'image-gallery-outside-'))
  try {
    fs.mkdirSync(path.join(outside, 'child'))
    fs.writeFileSync(path.join(outside, 'child/leaked.png'), 'fixture')
    fs.symlinkSync(outside, path.join(mockProjectRoot, 'outside'), 'dir')
    mockConfig.mockReturnValue({ includeFolders: ['outside/child/**'], excludeFolders: [] })
    expect(await getAllImgs(webview)).toEqual([])
  } finally {
    fs.rmSync(outside, { recursive: true, force: true })
  }
})

test('root scan publishes the complete priority subtree before reading siblings, without repeating directories', async () => {
  const readdir = jest.spyOn(fs.promises, 'readdir')
  const early: any[] = []
  try {
    const images = await getAllImgs(webview, null, { cancelled: false }, {
      basePath: mockProjectRoot, priorityPath: path.join(mockProjectRoot, 'assets/icons/a.svg'),
      onFirstImages: (snapshot) => {
        early.push(snapshot)
        expect(snapshot.map((image) => image.path).sort()).toEqual(['/assets/icons/a.svg', '/assets/icons/child/b.png'])
        expect(readdir.mock.calls.map(([directory]) => String(directory))).not.toContain(path.join(mockProjectRoot, 'assets/photos'))
      }
    })
    expect(early).toHaveLength(1)
    expect(images).toHaveLength(4)
    const directories = readdir.mock.calls.map(([directory]) => String(directory))
    expect(new Set(directories).size).toBe(directories.length)
  } finally { readdir.mockRestore() }
})
test('priority requests honor excludes and explicit base roots; .git is not traversed', async () => {
  fs.mkdirSync(path.join(mockProjectRoot, '.git'), { recursive: true })
  fs.writeFileSync(path.join(mockProjectRoot, '.git/hidden.jpg'), 'fixture')
  mockConfig.mockReturnValue({ includeFolders: [], excludeFolders: ['assets/icons'] })
  const early = jest.fn()
  const images = await getAllImgs(webview, null, { cancelled: false }, { basePath: mockProjectRoot,
    priorityPath: path.join(mockProjectRoot, 'assets/icons/a.svg'), onFirstImages: early })
  expect(early).not.toHaveBeenCalled()
  expect(images.map((image) => image.path).sort()).toEqual(['/assets/photos/c.jpg', '/root.JPG'])
  expect(mockConfig).toHaveBeenLastCalledWith(mockProjectRoot)
})

test('priority traversal cannot broaden a caller-provided subtree scope', async () => {
  const scope = path.join(mockProjectRoot, 'assets/icons')
  const images = await getAllImgs(webview, scope, { cancelled: false }, { basePath: mockProjectRoot,
    priorityPath: path.join(mockProjectRoot, 'assets/photos/c.jpg') })
  expect(images.map((image) => image.path).sort()).toEqual(['/assets/icons/a.svg', '/assets/icons/child/b.png'])
})
