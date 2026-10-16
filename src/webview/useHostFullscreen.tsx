import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { FullscreenAdapter } from 'right-image-preview'
import { MESSAGE_CMD } from '../constants'
import type { GalleryTransport } from './PreviewImages/galleryBridge'
import { useI18n } from '../i18n/react'

/** VS Code exposes toggle, but no public fullscreen-state subscription. Never guess that state. */
export function useHostFullscreen(transport: GalleryTransport) {
  const [error, setError] = useState<Error | null>(null)
  const mounted = useRef(true)
  const pending = useRef(new Set<() => void>())
  useEffect(() => {
    mounted.current = true
    const operations = pending.current
    return () => {
      mounted.current = false
      for (const cancel of operations) { cancel() }
    }
  }, [])
  const toggle = useCallback(() => new Promise<void>((resolve, reject) => {
    if (!mounted.current) { reject(new Error('The preview was closed')); return }
    setError(null)
    let finished = false
    const finish = (failure?: Error) => {
      if (finished) { return }
      finished = true
      window.clearTimeout(timer)
      pending.current.delete(cancel)
      if (failure) { reject(failure) } else { resolve() }
    }
    const cancel = () => finish(new Error('The preview was closed'))
    const timer = window.setTimeout(() => finish(new Error('No fullscreen response from the extension host')), 5000)
    pending.current.add(cancel)
    try {
      transport({ cmd: MESSAGE_CMD.TOGGLE_WINDOW_FULLSCREEN }, (result) => {
        if (result?.ok === true) { finish() }
        else { finish(new Error(typeof result?.error === 'string' ? result.error : 'Window fullscreen failed')) }
      })
    } catch (failure) { finish(failure instanceof Error ? failure : new Error(String(failure))) }
  }), [transport])
  const fullscreen = useMemo<FullscreenAdapter>(() => ({ toggle }), [toggle])
  const onFullscreenError = useCallback((failure: unknown) => {
    if (!mounted.current) { return }
    setError(failure instanceof Error ? failure : new Error(String(failure)))
    console.error('[image-viewer] Window fullscreen failed', failure)
  }, [])
  return { fullscreen, onFullscreenError, error }
}

export function FullscreenErrorNotice({ error }: { error: Error | null }) {
  const { t } = useI18n()
  if (!error) { return null }
  return <div role='alert' style={{ position: 'fixed', top: 20, left: '50%', transform: 'translateX(-50%)',
    zIndex: 20000, padding: '8px 12px', borderRadius: 6, background: 'var(--vscode-inputValidation-errorBackground, #5a1d1d)',
    color: 'var(--vscode-errorForeground, #fff)' }}>{t('preview.fullscreenFailed')}</div>
}
