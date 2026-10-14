import { ConfigurationTarget, ExtensionContext, Webview, env, workspace } from 'vscode'
import { MESSAGE_CMD } from '../constants'
import { effectiveLanguage, isLanguagePreference, LanguageSnapshot } from './language'
import { createTranslator, fixedTranslate } from './translator'

export const LANGUAGE_SETTING = 'imageViewer.language'
const webviews = new Set<Webview>()
let revision = 0
let writes: Promise<unknown> = Promise.resolve()
const translator = createTranslator()

export function getLanguageSnapshot(): LanguageSnapshot {
  const stored = workspace.getConfiguration('imageViewer').get<unknown>('language', 'auto')
  const preference = isLanguagePreference(stored) ? stored : 'auto'
  return { preference, language: effectiveLanguage(preference, env.language), revision }
}

export function hostText(...args: Parameters<ReturnType<typeof fixedTranslate>>): string {
  return fixedTranslate(translator, getLanguageSnapshot().language)(...args)
}

function postLanguage(webview: Webview): void {
  void Promise.resolve(webview.postMessage({ cmd: MESSAGE_CMD.UI_LANGUAGE_CHANGED, data: getLanguageSnapshot() }))
    .catch(() => {})
}

function publishLanguage(): LanguageSnapshot {
  revision++
  webviews.forEach(postLanguage)
  return getLanguageSnapshot()
}

export function registerLanguageService(context: ExtensionContext): void {
  context.subscriptions.push(workspace.onDidChangeConfiguration((event) => {
    if (event.affectsConfiguration(LANGUAGE_SETTING)) { publishLanguage() }
  }))
}

/** Lifetime follows the panel, never the selected language or the scanned workspace. */
export function trackLanguageWebview(webview: Webview): { dispose(): void } {
  webviews.add(webview)
  return { dispose: () => { webviews.delete(webview) } }
}

export function updateLanguagePreference(value: unknown): Promise<LanguageSnapshot> {
  if (!isLanguagePreference(value)) { return Promise.reject(new Error('Invalid language preference')) }
  // 多个面板共用同一用户偏好，串行保存，防止较早的异步写入覆盖较新的选择。
  const write = writes.catch(() => {}).then(async () => {
    await workspace.getConfiguration('imageViewer').update('language', value, ConfigurationTarget.Global)
    return publishLanguage()
  })
  writes = write
  return write
}

export async function languageRequest(cmd: string, value?: unknown) {
  if (cmd === MESSAGE_CMD.GET_UI_LANGUAGE) { return { ok: true, snapshot: getLanguageSnapshot() } }
  try {
    return { ok: true, snapshot: await updateLanguagePreference(value) }
  } catch {
    return { ok: false, snapshot: getLanguageSnapshot() }
  }
}
