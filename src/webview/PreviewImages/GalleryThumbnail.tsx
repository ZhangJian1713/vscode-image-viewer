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
          aria-label={`Retry ${image.fileName}`}
          title='Unable to load image. Retry'
        >
          Retry
        </button>
      ) : (
        <span className='iv-thumbnail-placeholder' aria-label='Loading thumbnail'>
          ···
        </span>
      )}
    </div>
  )
}
