import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { MESSAGE_CMD } from '../constants'
import type { GalleryTransport } from './PreviewImages/galleryBridge'
import { FilmstripThumbnailStore, FilmstripThumbnail } from './filmstripThumbnailStore'

export function useFilmstrip(transport: GalleryTransport, ids: string[], scope: 'single' | 'gallery', activeIndex: number) {
  const [visible, setVisible] = useState(false)
  const [indexes, setIndexes] = useState<number[]>([])
  const [thumbnails, setThumbnails] = useState<ReadonlyMap<string, FilmstripThumbnail>>(() => new Map())
  const [preferenceError, setPreferenceError] = useState(false)
  const changed = useRef(false)
  const mounted = useRef(false)
  const writeRevision = useRef(0)
  const pendingSaves = useRef(new Set<() => void>())
  const store = useMemo(() => new FilmstripThumbnailStore(transport), [transport])
  useEffect(() => {
    mounted.current = true
    store.activate(() => setThumbnails(store.snapshots()))
    const pending = pendingSaves.current
    return () => { mounted.current = false; store.destroy(); pending.forEach((cancel) => cancel()) }
  }, [store])
  useEffect(() => {
    let active = true
    try {
      transport({ cmd: MESSAGE_CMD.GET_FILMSTRIP_STATE }, (result) => {
        if (active && !changed.current && result?.ok === true) { setVisible(result.visible === true) }
      })
    } catch { /* A missing preference keeps the compatible closed default. */ }
    return () => { active = false }
  }, [transport, scope])
  const toggle = useCallback((next: boolean) => {
    changed.current = true
    setVisible(next)
    if (!next) { setIndexes([]) }
    setPreferenceError(false)
    const revision = ++writeRevision.current
    let done = false
    const cancel = () => finish(false)
    const finish = (ok: boolean) => {
      if (done) { return }
      done = true
      clearTimeout(timer)
      pendingSaves.current.delete(cancel)
      if (mounted.current && !ok && revision === writeRevision.current) { setPreferenceError(true) }
    }
    const timer = setTimeout(() => finish(false), 5000)
    pendingSaves.current.add(cancel)
    // Send the intent immediately, so closing the preview cannot discard an unsent preference.
    // The host serializes writes across all views; unmount only stops waiting for the reply.
    try { transport({ cmd: MESSAGE_CMD.SET_FILMSTRIP_STATE, data: { visible: next } }, (result) => finish(result?.ok === true)) }
    catch { finish(false) }
  }, [transport])
  const onVisibleIndexesChange = useCallback((next: number[]) => {
    setIndexes((previous) => previous.length === next.length && previous.every((value, i) => value === next[i]) ? previous : next)
  }, [])
  useEffect(() => {
    const ordered = visible ? [...indexes].sort((a, b) => Math.abs(a - activeIndex) - Math.abs(b - activeIndex)) : []
    store.setDemand(ordered.map((index) => ids[index]).filter(Boolean))
  }, [store, ids, indexes, activeIndex, visible])
  return { visible, toggle, onVisibleIndexesChange, store, thumbnails, preferenceError }
}
