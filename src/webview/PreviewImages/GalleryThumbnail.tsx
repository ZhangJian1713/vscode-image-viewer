import { useI18n } from '../../i18n/react'
import React, { useEffect, useState } from 'react'
import type { IImage } from './imageTypes'
import { galleryThumbnailKey, GalleryThumbnailStore, ThumbnailSnapshot } from './galleryThumbnailStore'
import { useRetainedResourceUrl } from '../resourceCache/ResourceCacheBoundary'
import { thumbPadStyle } from '../thumbSurfaceStyle'

export function useGalleryThumbnail(
  store: GalleryThumbnailStore,
  image: IImage,
  tier: number,
  priority: number,
  metadata: boolean
): ThumbnailSnapshot {
  const key = galleryThumbnailKey(image, tier)
  const [value, setValue] = useState<{ key: string; snapshot: ThumbnailSnapshot }>()
  useEffect(
    () => store.subscribe(image, tier, priority, metadata, (snapshot) => setValue({ key, snapshot })),
    [store, image, tier, priority, metadata, key]
  )
  return value?.key === key ? value.snapshot : { status: 'queued', src: null }
}

export const GalleryThumbnail: React.FC<{
  image: IImage
  snapshot: ThumbnailSnapshot
  store: GalleryThumbnailStore
  tier: number
  fill: boolean
  background: string
}> = ({ image, snapshot, store, tier, fill, background }) => {
  const { t } = useI18n()
  useRetainedResourceUrl(snapshot.src, snapshot.status === 'ready')
  return (
    <div className='iv-gallery-thumbnail' style={thumbPadStyle(background)}>
      {snapshot.src ? (
        <img
          src={snapshot.src}
          alt={image.fileName}
          draggable={false}
          decoding='async'
          style={{ objectFit: fill ? 'cover' : 'contain' }}
          onError={() => store.retry(image, tier)}
        />
      ) : snapshot.status === 'error' ? (
        <button
          className='iv-thumbnail-retry'
          onClick={(event) => {
            event.stopPropagation()
            store.retry(image, tier, true)
          }}
          aria-label={t('thumbnail.retry', { fileName: image.fileName })}
          title={t('thumbnail.loadFailed')}
        >
          {t('common.retry')}
        </button>
      ) : (
        <span className='iv-thumbnail-placeholder' aria-label={t('thumbnail.loading')}>
          ···
        </span>
      )}
    </div>
  )
}
