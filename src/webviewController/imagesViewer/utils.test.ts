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
const webview = { asWebviewUri: (uri) => uri } as any

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
