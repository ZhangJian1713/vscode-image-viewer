import { filmstripPreference, filmstripThumbnail, initFilmstripPreferences } from './filmstripHost'
import { resolveFilmstripThumbnail } from './webviewController/imagesViewer/thumbGridCache'
import { MESSAGE_CMD } from './constants'
jest.mock('./webviewController/imagesViewer/thumbGridCache', () => ({
  resolveFilmstripThumbnail: jest.fn(), cacheFsPathToThumbResourceUri: (value) => ({ path: value })
}))

test('thumbnail requests require host authorization and never return originals on failure', async () => {
  const webview = { asWebviewUri: (uri) => ({ toString: () => `cache:${uri.path}` }) } as any
  const authorize = jest.fn(async () => ({ filePath: '/authorized/a.jpg', sourceUri: { path: '/authorized/a.jpg' } as any }))
  ;(resolveFilmstripThumbnail as jest.Mock).mockResolvedValue({ kind: 'thumb', cacheFsPath: '/generated/200.jpg' })
  expect(await filmstripThumbnail(webview, 'image-id', authorize)).toEqual({ kind: 'thumb', thumbSrc: 'cache:/generated/200.jpg' })
  expect(resolveFilmstripThumbnail).toHaveBeenLastCalledWith('/authorized/a.jpg')
  ;(resolveFilmstripThumbnail as jest.Mock).mockClear()
  expect(await filmstripThumbnail(webview, '../outside', async () => { throw new Error('denied') })).toEqual({ kind: 'error' })
  expect(resolveFilmstripThumbnail).not.toHaveBeenCalled()
  expect(await filmstripThumbnail(webview, {}, authorize)).toEqual({ kind: 'error' })
  ;(resolveFilmstripThumbnail as jest.Mock).mockResolvedValue({ kind: 'original' })
  expect(await filmstripThumbnail(webview, 'small-or-svg', authorize)).toEqual({ kind: 'thumb', thumbSrc: 'cache:/authorized/a.jpg' })
  ;(resolveFilmstripThumbnail as jest.Mock).mockResolvedValue(null)
  expect(await filmstripThumbnail(webview, 'image-id', authorize)).toEqual({ kind: 'error' })
})

test('single/gallery defaults are closed and rapid preference writes keep the final value', async () => {
  const values = new Map<string, boolean>()
  const update = jest.fn(async (key, value) => { values.set(key, value) })
  initFilmstripPreferences({ globalState: { get: (key, fallback) => values.get(key) ?? fallback, update } } as any)
  expect(await filmstripPreference('single', MESSAGE_CMD.GET_FILMSTRIP_STATE)).toEqual({ ok: true, visible: false })
  await Promise.all([
    filmstripPreference('single', MESSAGE_CMD.SET_FILMSTRIP_STATE, true),
    filmstripPreference('single', MESSAGE_CMD.SET_FILMSTRIP_STATE, false),
    filmstripPreference('gallery', MESSAGE_CMD.SET_FILMSTRIP_STATE, true)
  ])
  expect(await filmstripPreference('single', MESSAGE_CMD.GET_FILMSTRIP_STATE)).toEqual({ ok: true, visible: false })
  expect(await filmstripPreference('gallery', MESSAGE_CMD.GET_FILMSTRIP_STATE)).toEqual({ ok: true, visible: true })
  const count = update.mock.calls.length
  expect(await filmstripPreference('single', MESSAGE_CMD.SET_FILMSTRIP_STATE, 'true')).toEqual({ ok: false })
  expect(update).toHaveBeenCalledTimes(count)
})
