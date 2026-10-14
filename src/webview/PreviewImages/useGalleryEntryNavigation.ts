import { useCallback, useEffect, useRef, useState } from 'react'
import { GalleryEntry, GalleryEntryResult } from '../../galleryEntry'
import { MESSAGE_CMD } from '../../constants'
import { sameImageFsPath } from '../imageSort'
import { callGalleryHost } from './galleryBridge'
import { completeGalleryImages, GalleryFolderIndex } from './galleryModel'
import { GalleryNavigationResolution, resolveGalleryNavigation } from './galleryNavigation'
import type { IImage } from './imageTypes'

interface NavigationOptions {
  initialEntry?: GalleryEntry
  ready: boolean
  complete: boolean
  root: string
  index: GalleryFolderIndex
  images: IImage[]
  visibleIndexes: Map<string, number>
  onReset: () => void
  onLocate: (_resolution: GalleryNavigationResolution, _id: number) => void
  onOpen: (_image: IImage, _previewOnly: boolean) => void
  onImageResolved?: (_image: IImage) => void
}
interface PendingNavigation {
  id: number
  entry: GalleryEntry
  image?: IImage
  stage: 'locate' | 'open'
  resolution?: GalleryNavigationResolution
}

/** Explicit intent stages keep scan completion, directory selection and preview opening separate. */
export function useGalleryEntryNavigation(options: NavigationOptions) {

  const current = useRef(options)
  current.current = options
  const sequence = useRef(0)
  const initialized = useRef(false)
  const [pending, setPending] = useState<PendingNavigation | null>(null)
  const [notice, setNotice] = useState<{ key: string; values?: { folderName?: string }; detail?: string } | null>(null)
  useEffect(() => () => { sequence.current++ }, [])
  const navigate = useCallback((entry: GalleryEntry) => {
    initialized.current = true
    const id = ++sequence.current
    setPending(null)
    setNotice(null)
    current.current.onReset()
    if (!entry.targetPath) { return }
    callGalleryHost({ cmd: MESSAGE_CMD.RESOLVE_GALLERY_ENTRY,
      data: { projectRoot: entry.rootPath, targetPath: entry.targetPath } }, (result: GalleryEntryResult) => {
      if (sequence.current !== id) { return }
      if (result.error) { setNotice({ key: 'gallery.targetFailed', detail: result.error }) }
      const resolved = result.entry || entry
      const image = result.image ? completeGalleryImages([result.image], resolved.rootPath)[0] : undefined
      if (image && current.current.complete) { current.current.onImageResolved?.(image) }
      setPending({ id, entry: resolved, image, stage: 'locate' })
    })
  }, [])
  useEffect(() => {
    if (options.ready && !initialized.current) {
      initialized.current = true
      if (options.initialEntry?.targetPath) { navigate(options.initialEntry) }
    }
  }, [options.ready, options.initialEntry, navigate])
  useEffect(() => {
    if (!pending || !options.ready || !options.root || !sameImageFsPath(options.root, pending.entry.rootPath)) { return }
    if (pending.stage === 'locate') {
      const resolution = resolveGalleryNavigation(pending.entry, options.index, options.images, options.complete, pending.image)
      if (!resolution) { return }
      current.current.onLocate(resolution, pending.id)
      if (resolution.previewOnly) {
        setNotice({ key: 'gallery.previewOnly' })
      } else if (resolution.fallback) {
        setNotice({ key: 'gallery.folderFallback', values: { folderName: resolution.folder.split('/').pop() || resolution.folder } })
      }
      setPending(resolution.image ? { ...pending, resolution, stage: 'open' } : null)
    } else if (pending.resolution.previewOnly || options.visibleIndexes.has(pending.resolution.image.fullPath)) {
      current.current.onOpen(pending.resolution.image, pending.resolution.previewOnly)
      setPending(null)
    }
  }, [pending, options.ready, options.complete, options.root, options.index, options.images, options.visibleIndexes])
  const clearNotice = useCallback(() => setNotice(null), [])
  const text = !notice ? '' : notice.key === 'gallery.previewOnly'
    ? 'This image is not in the current gallery. Opened in preview only; refresh or check folder filters.'
    : notice.key === 'gallery.folderFallback'
      ? `No images in the requested folder. Showing ${notice.values?.folderName}.`
      : `Unable to locate the requested resource${notice.detail ? ` · ${notice.detail}` : ''}`
  return { navigate, notice: text, clearNotice }
}
