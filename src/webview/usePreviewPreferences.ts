import { useCallback, useEffect, useRef, useState } from 'react'
import { MESSAGE_CMD } from '../constants'
import { isPreviewPreferencesSnapshot, PreviewPreferencesSnapshot } from '../previewPreferences'
import type { GalleryTransport } from './PreviewImages/galleryBridge'

interface PreferencesReply { ok?: boolean; snapshot?: unknown }

export function usePreviewPreferences(transport: GalleryTransport) {
  const [snapshot, setSnapshot] = useState<PreviewPreferencesSnapshot>({ showMirrorButtons: false, revision: -1 })
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState(false)
  const mounted = useRef(false)
  const cancelSave = useRef<(() => void) | null>(null)
  const accept = useCallback((value: unknown) => {
    if (!mounted.current || !isPreviewPreferencesSnapshot(value)) { return }
    setSnapshot((previous) => value.revision < previous.revision ? previous : value)
  }, [])

  useEffect(() => {
    let active = true
    mounted.current = true
    setSaving(false)
    const onMessage = (event: MessageEvent) => {
      if (event.data?.cmd === MESSAGE_CMD.PREVIEW_PREFERENCES_CHANGED) { accept(event.data.data) }
    }
    window.addEventListener('message', onMessage)
    try {
      transport({ cmd: MESSAGE_CMD.GET_PREVIEW_PREFERENCES }, (reply: PreferencesReply) => {
        if (active) { accept(reply?.snapshot) }
      })
    } catch { /* Defaults stay hidden if the host is unavailable. */ }
    return () => {
      active = false
      mounted.current = false
      cancelSave.current?.()
      window.removeEventListener('message', onMessage)
    }
  }, [transport, accept])

  const setShowMirrorButtons = useCallback((showMirrorButtons: boolean) => {
    if (!mounted.current || cancelSave.current) { return }
    setSaving(true)
    setSaveError(false)
    let done = false
    // Each operation owns its timer; an old reply cannot clear a newer operation's deadline.
    const cancel = () => {
      done = true
      clearTimeout(timer)
      cancelSave.current = null
    }
    const finish = (reply?: PreferencesReply) => {
      if (done || !mounted.current) { return }
      cancel()
      setSaving(false)
      accept(reply?.snapshot)
      setSaveError(reply?.ok !== true)
    }
    const timer = setTimeout(() => finish(), 5000)
    cancelSave.current = cancel
    try { transport({ cmd: MESSAGE_CMD.SET_PREVIEW_PREFERENCES, data: { showMirrorButtons } }, finish) }
    catch { finish() }
  }, [transport, accept])

  return { ...snapshot, saving, saveError, setShowMirrorButtons }
}
