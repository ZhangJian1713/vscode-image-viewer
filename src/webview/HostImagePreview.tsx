import React, { useMemo, useState, useCallback } from 'react'
import { useFilmstrip } from './useFilmstrip'
import { ImagePreview } from 'right-image-preview'
import type { ImagePreviewProps, ImageItem } from 'right-image-preview'
import type { GalleryTransport } from './PreviewImages/galleryBridge'
import { useI18n } from '../i18n/react'
import { FullscreenErrorNotice, useHostFullscreen } from './useHostFullscreen'

type Props = Omit<ImagePreviewProps, 'fullscreen' | 'onFullscreenError'> & { transport: GalleryTransport; filmstripScope: 'single' | 'gallery' }

/** The adapter and pending RPCs live exactly as long as this preview instance. */
export function HostImagePreview({ transport, filmstripScope, ...props }: Props) {
  const [index, setIndex] = useState(() => {
    const selection = props.defaultGroupedSelection
    if (!props.groupedImages || !selection) { return props.defaultIndex ?? 0 }
    return props.groupedImages.slice(0, selection.defaultGroupIndex ?? 0).reduce((sum, group) => sum + group.images.length, 0)
      + (selection.defaultIndexInGroup ?? 0)
  })
  const base = useMemo(() => props.groupedImages ? props.groupedImages.reduce<ImageItem[]>((all, group) => all.concat(group.images), []) : props.images || [],
    [props.groupedImages, props.images])
  const ids = useMemo(() => base.map((image) => image.id ?? image.src), [base])
  const strip = useFilmstrip(transport, ids, filmstripScope, index)
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
  const host = useHostFullscreen(transport)
  const { t } = useI18n()
  return <>
    <ImagePreview {...props} {...data} onIndexChange={onIndexChange}
      showThumbnailToggle showThumbnails={strip.visible} onThumbnailsVisibleChange={strip.toggle}
      onThumbnailVisibleIndexesChange={strip.onVisibleIndexesChange} fullscreen={host.fullscreen} onFullscreenError={host.onFullscreenError}
      strings={{ ...props.strings, toggleFullscreen: t('preview.toggleWindowFullscreen') }} />
    <FullscreenErrorNotice error={host.error} />
    {strip.preferenceError && <div role='alert' style={{ position: 'fixed', top: 20, left: 20, zIndex: 20000 }}>
      {t('preview.filmstripPreferenceFailed')}
    </div>}
  </>
}
