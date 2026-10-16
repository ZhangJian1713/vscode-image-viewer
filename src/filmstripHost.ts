import type { ExtensionContext, Webview, Uri } from 'vscode'
import { MESSAGE_CMD } from './constants'
import { cacheFsPathToThumbResourceUri, resolveFilmstripThumbnail } from './webviewController/imagesViewer/thumbGridCache'

export type FilmstripScope = 'single' | 'gallery'
/** Keep the authorized resource URI, so direct sources also work under a symlinked panel root. */
export interface AuthorizedFilmstripImage { filePath: string; sourceUri: Uri }
export type FilmstripThumbnailResult = { kind: 'thumb'; thumbSrc: string } | { kind: 'error' }
let context: ExtensionContext | undefined
const writes = new Map<FilmstripScope, Promise<unknown>>()
export function initFilmstripPreferences(value: ExtensionContext): void { context = value; writes.clear() }

/** The host binds scope; webview messages cannot choose another editor's preference key. */
export async function filmstripPreference(scope: FilmstripScope, cmd: string, visible?: unknown) {
  if (!context) { return { ok: false } }
  const state = context.globalState
  const key = `imageViewer.filmstrip.${scope}`
  if (cmd === MESSAGE_CMD.GET_FILMSTRIP_STATE) {
    await writes.get(scope)?.catch(() => undefined)
    return { ok: true, visible: state.get<boolean>(key, false) }
  }
  if (typeof visible !== 'boolean') { return { ok: false } }
  const previous = writes.get(scope) || Promise.resolve()
  const write = previous.catch(() => undefined).then(() => state.update(key, visible))
  writes.set(scope, write)
  try { await write; return { ok: true } } catch { return { ok: false } }
}

/* eslint-disable no-unused-vars -- callback signature */
export async function filmstripThumbnail(webview: Webview, id: unknown,
  authorize: (id: string) => Promise<AuthorizedFilmstripImage>): Promise<FilmstripThumbnailResult> {
  try {
    if (typeof id !== 'string' || !id || id.length > 32768 || id.includes('\0')) { return { kind: 'error' } }
    const target = await authorize(id)
    const result = await resolveFilmstripThumbnail(target.filePath)
    if (!result) { return { kind: 'error' } }
    const uri = result.kind === 'original' ? target.sourceUri : cacheFsPathToThumbResourceUri(result.cacheFsPath)
    if (!uri) { return { kind: 'error' } }
    const resource = webview.asWebviewUri(uri)
    // Generated filenames already contain the content version; direct SVG/small originals need one too.
    return { kind: 'thumb', thumbSrc: result.kind === 'original'
      ? resource.with({ query: `v=${result.version}` }).toString() : resource.toString() }
  } catch { return { kind: 'error' } }
}
