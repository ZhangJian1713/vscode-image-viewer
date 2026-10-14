import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { createHash } from 'crypto'
import { setTimeout as realSetTimeout } from 'timers'
import { initGridThumbGlobalStorage, resolveThumbForGrid } from './thumbGridCache'
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
jest.mock('child_process', () => ({
  execFile: (...args: any[]) => args[args.length - 1](new Error('Native thumbnail backend disabled in this test'))
}))

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
