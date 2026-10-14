import React, { useMemo, useState } from 'react'
import { ImagePreview } from '../vendor/right-image-preview'
import { PREVIEW_ZOOM_STOPS } from './previewZoomStops'
import type { ImageGroup } from '../vendor/right-image-preview'
import { callVscode } from '@easy_vscode/webview'
import { MESSAGE_CMD } from '../constants'
import { useResourceCacheSlot } from './resourceCache/ResourceCacheBoundary'

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
  const { src, name, images, currentIndex } = readSingleImageViewerArgs()
  const resolvedImages = useMemo(() => {
    if (images && images.length > 0) {
      return images
    }
    if (!src) {
      return []
    }
    const imageName = name || 'Image'
    return [{ id: src, src, name: imageName }]
  }, [images, src, name])
  const groupedImages = useMemo<ImageGroup[] | undefined>(() => {
    if (resolvedImages.length === 0) {
      return undefined
    }
    return [
      {
        name: '',
        images: resolvedImages.map((image) => ({ ...image, alt: image.name }))
      }
    ]
  }, [resolvedImages])

  const initialIndex = Math.min(Math.max(currentIndex ?? 0, 0), Math.max(resolvedImages.length - 1, 0))
  const [activeIndex, setActiveIndex] = useState(initialIndex)
  useResourceCacheSlot('single-editor-main-image', resolvedImages[activeIndex]?.src)

  if (!groupedImages) {
    return <div style={{ padding: 20, color: 'var(--vscode-errorForeground)' }}>Unable to open this image.</div>
  }

  return (
    <ImagePreview
      groupedImages={groupedImages}
      visible
      defaultGroupedSelection={{ defaultGroupIndex: 0, defaultIndexInGroup: initialIndex }}
      stops={PREVIEW_ZOOM_STOPS}
      wheelEnabled
      clickZoomEnabled
      doubleClickEnabled={false}
      closeOnMaskClick
      arrows='side'
      showFlip
      progressiveMain={false}
      onIndexChange={setActiveIndex}
      onClose={() => callVscode({ cmd: MESSAGE_CMD.CLOSE_CUSTOM_IMAGE_EDITOR })}
    />
  )
}

export default SingleImageViewer
