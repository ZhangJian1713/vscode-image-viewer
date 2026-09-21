import React, { useMemo } from 'react'
import { ImagePreview } from 'right-image-preview'
import type { ImageGroup } from 'right-image-preview'
import { callVscode } from '@easy_vscode/webview'
import { MESSAGE_CMD } from '../constants'

type SingleImageViewerArgs = {
  src?: string
  name?: string
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
    name: typeof value.name === 'string' ? value.name : undefined
  }
}

const SingleImageViewer: React.FC = () => {
  const { src, name } = readSingleImageViewerArgs()
  const groupedImages = useMemo<ImageGroup[] | undefined>(() => {
    if (!src) {
      return undefined
    }
    const imageName = name || 'Image'
    return [
      {
        name: '',
        images: [
          {
            id: src,
            src,
            name: imageName,
            alt: imageName
          }
        ]
      }
    ]
  }, [src, name])

  if (!groupedImages) {
    return (
      <div style={{ padding: 20, color: 'var(--vscode-errorForeground)' }}>
        Unable to open this image.
      </div>
    )
  }

  return (
    <ImagePreview
      groupedImages={groupedImages}
      visible
      defaultIndex={0}
      wheelEnabled
      doubleClickEnabled
      closeOnMaskClick
      arrows='side'
      showFlip
      onClose={() => callVscode({ cmd: MESSAGE_CMD.CLOSE_CUSTOM_IMAGE_EDITOR })}
    />
  )
}

export default SingleImageViewer
