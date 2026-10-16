import { HostImagePreview } from './HostImagePreview'
import React, { useMemo, useState } from 'react'
import { PREVIEW_ZOOM_STOPS } from './previewZoomStops'
import { callVscode } from '@easy_vscode/webview'
import { MESSAGE_CMD } from '../constants'
import { useResourceCacheSlot } from './resourceCache/ResourceCacheBoundary'
import { useI18n } from '../i18n/react'

type SingleImageViewerArgs = {
  src?: string
  name?: string
  images?: Array<{
    id: string
    src: string
    name: string
  }>
  currentIndex?: number
}

function readSingleImageViewerArgs(): SingleImageViewerArgs {
  if (typeof window === 'undefined') {
    return {}
  }
  const args = (window as Window & { commandArgs?: unknown[] }).commandArgs?.[0]
  if (!args || typeof args !== 'object') {
    return {}
  }
  const value = args as SingleImageViewerArgs
  return {
    src: typeof value.src === 'string' ? value.src : undefined,
    name: typeof value.name === 'string' ? value.name : undefined,
    images: Array.isArray(value.images)
      ? value.images.filter(
          (image) =>
            image && typeof image.id === 'string' && typeof image.src === 'string' && typeof image.name === 'string'
        )
      : undefined,
    currentIndex:
      typeof value.currentIndex === 'number' && Number.isInteger(value.currentIndex) ? value.currentIndex : undefined
  }
}

const SingleImageViewer: React.FC = () => {
  const { t, language } = useI18n()
  // Bootstrap data is immutable for this editor session. Translation renders must not rebuild it.
  const [{ src, name, images, currentIndex }] = useState(readSingleImageViewerArgs)
  const resolvedImages = useMemo(() => {
    if (images && images.length > 0) {
      return images
    }
    if (!src) {
      return []
    }
    return [{ id: src, src, name: name || '' }]
  }, [images, src, name])
  const previewImages = useMemo(() => resolvedImages.map((image) => ({ ...image, alt: image.name })), [resolvedImages])

  const initialIndex = Math.min(Math.max(currentIndex ?? 0, 0), Math.max(resolvedImages.length - 1, 0))
  const [activeIndex, setActiveIndex] = useState(initialIndex)
  useResourceCacheSlot('single-editor-main-image', resolvedImages[activeIndex]?.src)

  if (!previewImages.length) {
    return <div style={{ padding: 20, color: 'var(--vscode-errorForeground)' }}>{t('single.openFailed')}</div>
  }

  return (
    <HostImagePreview
      filmstripScope='single'
      transport={callVscode}
      language={language}
      images={previewImages}
      visible
      defaultIndex={initialIndex}
      stops={PREVIEW_ZOOM_STOPS}
      fitMaxNativePercent={100}
      preloadRadius={1}
      preloadDisplaySlots={2}
      preloadDisplayMode='slot'
      wheelEnabled
      clickZoomEnabled
      doubleClickEnabled={false}
      closeOnMaskClick={false}
      arrows='both'
      progressiveMain={false}
      errorFallback={() => <div role='alert'>{t('preview.loadFailed')}</div>}
      onIndexChange={setActiveIndex}
      onClose={() => callVscode({ cmd: MESSAGE_CMD.CLOSE_CUSTOM_IMAGE_EDITOR })}
    />
  )
}

export default SingleImageViewer
