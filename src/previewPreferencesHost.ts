import { ConfigurationTarget, ExtensionContext, Webview, workspace } from 'vscode'
import { MESSAGE_CMD } from './constants'
import { MIRROR_BUTTONS_SETTING, PreviewPreferencesSnapshot } from './previewPreferences'

const webviews = new Set<Webview>()
let revision = 0
let writes: Promise<unknown> = Promise.resolve()
export function getPreviewPreferences(): PreviewPreferencesSnapshot {
  return { showMirrorButtons: workspace.getConfiguration('imageViewer').get<unknown>('showMirrorButtons', false) === true, revision }
}
function publish() {
  revision++
  const snapshot = getPreviewPreferences()
  webviews.forEach((webview) => {
    void Promise.resolve(webview.postMessage({ cmd: MESSAGE_CMD.PREVIEW_PREFERENCES_CHANGED, data: snapshot })).catch(() => {})
  })
  return snapshot
}
export function registerPreviewPreferences(context: ExtensionContext) {
  context.subscriptions.push(workspace.onDidChangeConfiguration((event) => {
    if (event.affectsConfiguration(MIRROR_BUTTONS_SETTING)) { publish() }
  }))
}
export function trackPreviewPreferences(webview: Webview) {
  webviews.add(webview)
  return { dispose: () => { webviews.delete(webview) } }
}
export async function previewPreferencesRequest(cmd: string, value?: unknown) {
  if (cmd === MESSAGE_CMD.GET_PREVIEW_PREFERENCES) { return { ok: true, snapshot: getPreviewPreferences() } }
  if (cmd !== MESSAGE_CMD.SET_PREVIEW_PREFERENCES || typeof value !== 'boolean') { return { ok: false, snapshot: getPreviewPreferences() } }
  const write = writes.catch(() => {}).then(async () => {
    await workspace.getConfiguration('imageViewer').update('showMirrorButtons', value, ConfigurationTarget.Global)
    return publish()
  })
  writes = write
  try { return { ok: true, snapshot: await write } }
  catch { return { ok: false, snapshot: getPreviewPreferences() } }
}
