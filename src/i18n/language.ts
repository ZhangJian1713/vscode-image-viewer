export const SUPPORTED_LANGUAGES = ['en', 'zh-CN', 'zh-TW'] as const
export type SupportedLanguage = typeof SUPPORTED_LANGUAGES[number]
export type LanguagePreference = 'auto' | SupportedLanguage

export interface LanguageSnapshot {
  preference: LanguagePreference
  language: SupportedLanguage
  revision: number
}

export function isLanguagePreference(value: unknown): value is LanguagePreference {
  return value === 'auto' || value === 'en' || value === 'zh-CN' || value === 'zh-TW'
}

/** Only the editor locale selects the default; the OS/browser locale must not override it. */
export function resolveLanguage(locale: string | null | undefined): SupportedLanguage {
  const tag = typeof locale === 'string' ? locale.trim().replace(/_/g, '-').toLowerCase() : ''
  if (!/^[a-z]{2,3}(?:-[a-z0-9]{2,8})*$/.test(tag)) { return 'en' }
  const [primary, ...parts] = tag.split('-')
  if (primary !== 'zh') { return 'en' }
  // An explicit script wins over the region (e.g. zh-Hans-HK remains Simplified).
  if (parts.includes('hans')) { return 'zh-CN' }
  if (parts.includes('hant') || parts.some((part) => ['tw', 'hk', 'mo'].includes(part))) { return 'zh-TW' }
  return 'zh-CN'
}

export function effectiveLanguage(preference: LanguagePreference, editorLocale?: string): SupportedLanguage {
  return preference === 'auto' ? resolveLanguage(editorLocale) : preference
}

export function isLanguageSnapshot(value: unknown): value is LanguageSnapshot {
  const snapshot = value as LanguageSnapshot
  return !!snapshot && isLanguagePreference(snapshot.preference) &&
    SUPPORTED_LANGUAGES.includes(snapshot.language) && Number.isSafeInteger(snapshot.revision) && snapshot.revision >= 0
}
