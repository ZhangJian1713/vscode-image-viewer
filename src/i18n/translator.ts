import { createInstance } from 'i18next'
import type { ThirdPartyModule } from 'i18next'
import { en } from './en'
import { zhCN } from './zh-CN'
import { zhTW } from './zh-TW'
import type { TranslationKey } from './en'
import type { SupportedLanguage } from './language'

export type TranslationValues = Record<string, string | number>
export type Translate = (_key: TranslationKey, _values?: TranslationValues) => string

/** Bundled catalogs initialize synchronously; language switching never fetches resources. */
export function createTranslator(language: SupportedLanguage = 'en', binding?: ThirdPartyModule) {
  const instance = createInstance()
  if (binding) { instance.use(binding) }
  void instance.init({
    resources: { en: { translation: en }, 'zh-CN': { translation: zhCN }, 'zh-TW': { translation: zhTW } },
    lng: language,
    fallbackLng: 'en',
    supportedLngs: ['en', 'zh-CN', 'zh-TW'],
    keySeparator: false,
    initImmediate: false,
    returnNull: false,
    interpolation: { escapeValue: false },
    react: { useSuspense: false }
  })
  return instance
}

export function fixedTranslate(instance: ReturnType<typeof createTranslator>, language: SupportedLanguage): Translate {
  return (key, values) => instance.t(key, { ...values, lng: language }) as string
}
