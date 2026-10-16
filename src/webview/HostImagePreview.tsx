import React, { useMemo, useState, useCallback } from 'react'
import { ShortcutHelp } from './ShortcutHelp'
import { useFilmstrip } from './useFilmstrip'
import { ImagePreview } from 'right-image-preview'
import type { ImagePreviewProps, ImageItem } from 'right-image-preview'
import type { GalleryTransport } from './PreviewImages/galleryBridge'
import { useI18n } from '../i18n/react'
import { FullscreenErrorNotice, useHostFullscreen } from './useHostFullscreen'
import './HostImagePreview.css'
import { usePreviewPreferences } from './usePreviewPreferences'
import { PREVIEW_SMALL_IMAGE_ZOOM } from './previewZoomStops'

type Props = Omit<ImagePreviewProps, 'fullscreen' | 'onFullscreenError' | 'smallImageZoom'> & { transport: GalleryTransport; filmstripScope: 'single' | 'gallery' }

/** The adapter and pending RPCs live exactly as long as this preview instance. */
export function HostImagePreview({ transport, filmstripScope, ...props }: Props) {
  const [index, setIndex] = useState(() => {
    const selection = props.defaultGroupedSelection
    if (!props.groupedImages || !selection) { return props.defaultIndex ?? 0 }
    return props.groupedImages.slice(0, selection.defaultGroupIndex ?? 0).reduce((sum, group) => sum + group.images.length, 0)
      + (selection.defaultIndexInGroup ?? 0)
  })
  const base = useMemo(() => {
    if (!props.groupedImages) { return props.images || [] }
    const images: ImageItem[] = []
    for (const group of props.groupedImages) {
      for (const image of group.images) { images.push(image) }
    }
    return images
  }, [props.groupedImages, props.images])
  const ids = useMemo(() => base.map((image) => image.id ?? image.src), [base])
  const strip = useFilmstrip(transport, ids, filmstripScope, props.index ?? index)
  const { thumbnails } = strip
  const data = useMemo(() => {
    let flatIndex = 0
    const adapt = (image: typeof base[number]) => {
      const thumb = thumbnails.get(ids[flatIndex++])
      return { ...image, thumbnailSrc: thumb?.src ?? null, thumbnailError: thumb?.error ?? false }
    }
    // Preserve grouping and the main-image identity; only strip URLs change asynchronously.
    return props.groupedImages
      ? { groupedImages: props.groupedImages.map((group) => ({ ...group, images: group.images.map(adapt) })) }
      : { images: base.map(adapt) }
  }, [base, ids, thumbnails, props.groupedImages])
  const notifyIndex = props.onIndexChange
  const onIndexChange = useCallback((next: number) => { setIndex(next); notifyIndex?.(next) }, [notifyIndex])
  const [shortcutsOpen, setShortcutsOpen] = useState(false)
  const openShortcuts = useCallback(() => setShortcutsOpen(true), [])
  const closeShortcuts = useCallback(() => setShortcutsOpen(false), [])
  const capabilities = useMemo(() => ({ navigation: base.length > 1,
    groups: (props.groupedImages?.filter((group) => group.images.length).length ?? 0) > 1,
    shortcuts: true, exif: props.showExif === true, delete: props.showDelete === true }),
  [base.length, props.groupedImages, props.showExif, props.showDelete])
  const host = useHostFullscreen(transport)
  const preferences = usePreviewPreferences(transport)
  const { t } = useI18n()
  return <>
    <ImagePreview {...props} {...data} onIndexChange={onIndexChange}
      smallImageZoom={PREVIEW_SMALL_IMAGE_ZOOM}
      showFlip={preferences.showMirrorButtons} showRotateCCW={false}
      overlayStyle={{ ...props.overlayStyle, background: '#000', backdropFilter: 'none', WebkitBackdropFilter: 'none' }}
      keyboardEnabled={props.keyboardEnabled !== false && !shortcutsOpen} onShowShortcuts={openShortcuts}
      wheelEnabled={props.wheelEnabled !== false && !shortcutsOpen} pinchEnabled={props.pinchEnabled !== false && !shortcutsOpen}
      toolbarExtra={<>{props.toolbarExtra}<button type='button' onClick={openShortcuts} title={t('shortcuts.open')}
        className='iv-preview-help-button' aria-label={t('shortcuts.open')} aria-haspopup='dialog' aria-expanded={shortcutsOpen}>
        <svg width='22' height='22' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2'
          strokeLinecap='round' strokeLinejoin='round' aria-hidden='true' focusable='false'>
          <circle cx='12' cy='12' r='9' />
          <path d='M9.5 9a2.5 2.5 0 0 1 5 0c0 1.7-2.5 2-2.5 3.5' />
          <circle cx='12' cy='16' r='1' fill='currentColor' stroke='none' />
        </svg>
      </button></>}
      showThumbnailToggle showThumbnails={strip.visible} onThumbnailsVisibleChange={strip.toggle}
      onThumbnailVisibleIndexesChange={strip.onVisibleIndexesChange} fullscreen={host.fullscreen} onFullscreenError={host.onFullscreenError}
      strings={{ ...props.strings, toggleFullscreen: t('preview.toggleWindowFullscreen') }} />
    {shortcutsOpen && <ShortcutHelp capabilities={capabilities} onClose={closeShortcuts} />}
    <FullscreenErrorNotice error={host.error} />
    {strip.preferenceError && <div role='alert' style={{ position: 'fixed', top: 20, left: 20, zIndex: 20000 }}>
      {t('preview.filmstripPreferenceFailed')}
    </div>}
  </>
}
