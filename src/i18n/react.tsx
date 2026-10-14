import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { initReactI18next, I18nextProvider, useTranslation } from 'react-i18next'
import { MESSAGE_CMD } from '../constants'
import { isLanguageSnapshot, LanguagePreference, LanguageSnapshot, resolveLanguage } from './language'
import { createTranslator, Translate } from './translator'
import type { GalleryTransport } from '../webview/PreviewImages/galleryBridge'

const editorLocale = typeof window === 'undefined' ? undefined :
  (window as Window & { vscodeEnv?: { language?: string } }).vscodeEnv?.language
export const webviewI18n = createTranslator(resolveLanguage(editorLocale), initReactI18next)

const initialSnapshot: LanguageSnapshot = { preference: 'auto', language: resolveLanguage(editorLocale), revision: -1 }
const LanguageContext = createContext({
  ...initialSnapshot,
  saving: false,
  saveError: false,
  setPreference: (_value: LanguagePreference) => {}
})

export function LanguageProvider({ children, transport }: { children: React.ReactNode; transport: GalleryTransport }) {
  const [snapshot, setSnapshot] = useState(initialSnapshot)
  const current = useRef(initialSnapshot)
  const [ready, setReady] = useState(false)
  const [saving, setSaving] = useState(false)
  const pending = useRef(false)
  const [saveError, setSaveError] = useState(false)
  const mounted = useRef(false)

  const accept = useCallback((value: unknown) => {
    if (!mounted.current || !isLanguageSnapshot(value) || value.revision < current.current.revision) { return }
    current.current = value
    if (webviewI18n.language !== value.language) { void webviewI18n.changeLanguage(value.language) }
    document.documentElement.lang = value.language
    document.documentElement.dir = 'ltr'
    setSnapshot(value)
    setReady(true)
  }, [])

  useEffect(() => {
    mounted.current = true
    const onMessage = (event: MessageEvent) => {
      if (event.data?.cmd === MESSAGE_CMD.UI_LANGUAGE_CHANGED) { accept(event.data.data) }
    }
    window.addEventListener('message', onMessage)
    // Install the listener first; a delayed bootstrap reply cannot replace a newer broadcast.
    transport({ cmd: MESSAGE_CMD.GET_UI_LANGUAGE }, (result) => accept(result?.snapshot))
    return () => { mounted.current = false; window.removeEventListener('message', onMessage) }
  }, [transport, accept])

  const setPreference = useCallback((preference: LanguagePreference) => {
    if (pending.current || preference === current.current.preference) { return }
    pending.current = true
    setSaving(true)
    setSaveError(false)
    transport({ cmd: MESSAGE_CMD.SET_UI_LANGUAGE, data: { preference } }, (result) => {
      if (!mounted.current) { return }
      pending.current = false
      setSaving(false)
      accept(result?.snapshot)
      setSaveError(result?.ok !== true)
    })
  }, [transport, accept])

  const value = useMemo(() => ({ ...snapshot, saving, saveError, setPreference }), [snapshot, saving, saveError, setPreference])
  return <I18nextProvider i18n={webviewI18n}>
    <LanguageContext.Provider value={value}>{ready ? children : null}</LanguageContext.Provider>
  </I18nextProvider>
}

export const useLanguage = () => useContext(LanguageContext)

/** Rendering-only translator: business Effects and resource identity must not depend on `t`. */
export function useI18n() {
  const { t: bound, i18n } = useTranslation()
  const t = useCallback<Translate>((key, values) => bound(key, values) as string, [bound])
  const language = resolveLanguage(i18n.resolvedLanguage || i18n.language)
  const number = useMemo(() => new Intl.NumberFormat(language), [language])
  const date = useMemo(() => new Intl.DateTimeFormat(language, { year: 'numeric', month: 'numeric', day: 'numeric',
    hour: 'numeric', minute: 'numeric', second: 'numeric' }), [language])
  return { t, language, formatNumber: number.format, formatDate: date.format }
}

export function TranslatedText({ message, values }: { message: Parameters<Translate>[0]; values?: Parameters<Translate>[1] }) {
  const { t } = useI18n()
  return <>{t(message, values)}</>
}
