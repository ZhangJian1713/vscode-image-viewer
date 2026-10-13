/**
 * One grid cell: intersection-based prefetch bands, registry retain/release, staggered mount, Spin placeholder.
 */
import { EyeOutlined } from '@ant-design/icons'
import { callVscode } from '@easy_vscode/webview'
import { useInViewport } from 'ahooks'
import { Image, Spin } from 'antd'
import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import styled from 'styled-components'
import type { IImage } from '../imageTypes'
import { MESSAGE_CMD } from '../../../constants'
import { imageInlineBackground, thumbPadStyle } from '../../thumbSurfaceStyle'
import { useRetainedResourceUrl } from '../../resourceCache/ResourceCacheBoundary'
import {
  computeThumbRetentionScore,
  useThumbLoadBudget
} from '../thumbLoadBudget'

/* eslint-disable no-unused-vars -- type-only callback parameter names */
interface IImageLazyLoadProps {
  enableLazyLoad: boolean
  img: IImage
  backgroundColor: string
  autoPreview: boolean
  onAutoPreview: () => void
  /** Called when user clicks thumbnail or autoPreview fires — opens external lightbox at the right index. */
  onOpenPreview: () => void
  indexInFolder: number
  imageGridColumns: number
  /** Host thumbnail decode tier max edge (100 / 200 / 400 / 800 / 1600), derived from column width. */
  thumbTargetMaxEdgePx: number
  /** Report resolved thumbnail URL so lightbox minimap can avoid full-size source. */
  onThumbResolved?: (_vscodePath: string, _thumbSrc: string) => void
}
/* eslint-enable no-unused-vars */

const CellShell = styled.div`
  width: 100%;
  aspect-ratio: 1 / 1;
  min-width: 0;
  min-height: 0;
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
`

const ImgFit = styled.div`
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 0;
  position: relative;
  cursor: pointer;

  &:hover .iv-thumb-mask {
    opacity: 1;
  }
`

const ThumbMask = styled.div`
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  color: #fff;
  font-size: 14px;
  opacity: 0;
  transition: opacity 0.2s;
  pointer-events: none;
`

const LoadingCenter = styled.div`
  width: 100%;
  height: 100%;
  min-height: 0;
  display: flex;
  align-items: center;
  justify-content: center;
`

const MIN_SIZE_SHOW_PREVIEW_INFO = 60

interface IDimensions {
  width: number
  height: number
}

type GridThumbCallback = { kind: 'thumb'; thumbSrc: string } | { kind: 'original' }

const ImageLazyLoad: React.FC<IImageLazyLoadProps> = ({
  enableLazyLoad,
  img,
  backgroundColor,
  autoPreview = false,
  onAutoPreview,
  onOpenPreview,
  indexInFolder,
  imageGridColumns,
  thumbTargetMaxEdgePx,
  onThumbResolved
}) => {
  const { scrollRootRef, ioGeneration, registry, reveal } = useThumbLoadBudget()
  const shellRef = useRef<HTMLDivElement>(null)

  // ahooks `useInViewport` only rebinds when rootMargin/threshold change — nudge threshold so scroll root is picked up after mount.
  const ioEpsilon = ioGeneration * 1e-9
  const ioVisibleOpts = useMemo(
    () => ({ root: scrollRootRef, threshold: 0.01 + ioEpsilon }),
    [scrollRootRef, ioGeneration, ioEpsilon]
  )
  const ioNeighborOpts = useMemo(
    () => ({ root: scrollRootRef, rootMargin: '100% 0px 100% 0px', threshold: ioEpsilon }),
    [scrollRootRef, ioGeneration, ioEpsilon]
  )
  const ioWideOpts = useMemo(
    () => ({ root: scrollRootRef, rootMargin: '200% 0px 200% 0px', threshold: ioEpsilon }),
    [scrollRootRef, ioGeneration, ioEpsilon]
  )

  const [inVisible] = useInViewport(shellRef, ioVisibleOpts)
  const [inNeighbor] = useInViewport(shellRef, ioNeighborOpts)
  const [inWide] = useInViewport(shellRef, ioWideOpts)

  const [latched, setLatched] = useState(false)
  const [held, setHeld] = useState(!enableLazyLoad)
  const [painted, setPainted] = useState(!enableLazyLoad)
  const [dimensions, setDimensions] = useState<IDimensions>()
  const [everAutoPreview, setEverAutoPreview] = useState(false)
  const [cellEdge, setCellEdge] = useState(0)
  const [gridDisplaySrc, setGridDisplaySrc] = useState<string | null>(null)
  const thumbRequestKeyDone = useRef<string | null>(null)

  const v = inVisible === true
  const n = inNeighbor === true
  const w = inWide === true

  const score = useMemo(
    () =>
      enableLazyLoad
        ? computeThumbRetentionScore({
            inVisible: v,
            inNeighbor: n,
            inWide: w,
            latched,
            indexInFolder,
            cols: imageGridColumns
          })
        : 0,
    [enableLazyLoad, v, n, w, latched, indexInFolder, imageGridColumns]
  )

  useLayoutEffect(() => {
    if (!enableLazyLoad) {
      setHeld(true)
      return
    }
    return registry.subscribe(img.fullPath, setHeld)
  }, [enableLazyLoad, img.fullPath, registry])

  useLayoutEffect(() => {
    if (!enableLazyLoad) {
      registry.release(img.fullPath)
      return
    }
    if (score <= 0) {
      registry.release(img.fullPath)
    } else {
      registry.retain(img.fullPath, score)
    }
  }, [enableLazyLoad, img.fullPath, score, registry])

  useEffect(() => {
    if (!enableLazyLoad) {
      return () => {}
    }
    const path = img.fullPath
    return () => {
      registry.release(path)
    }
  }, [enableLazyLoad, img.fullPath, registry])

  useLayoutEffect(() => {
    const el = shellRef.current
    if (!el) {
      return
    }
    const read = () => setCellEdge(el.clientWidth)
    read()
    const ro = new ResizeObserver(read)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const inDecodeOrLatched = latched || w
  const rawShow = enableLazyLoad ? held && inDecodeOrLatched : true

  useEffect(() => {
    if (!enableLazyLoad) {
      setPainted(true)
      return
    }
    if (!rawShow || !held) {
      reveal.cancel(img.fullPath)
      setPainted(false)
      return
    }
    if (painted) {
      return
    }
    const pri = v ? 1000 : n && !v ? 850 : 620
    reveal.request(img.fullPath, pri, () => setPainted(true))
  }, [enableLazyLoad, rawShow, held, painted, v, n, img.fullPath, reveal])

  const handleMouseOver = () => {
    if (!dimensions) {
      callVscode({ cmd: MESSAGE_CMD.GET_IMAGE_SIZE, data: { filePath: img.fullPath } }, (dimensions) => {
        setDimensions(dimensions)
      })
    }
  }

  const isShow = rawShow && painted
  useRetainedResourceUrl(gridDisplaySrc, isShow && gridDisplaySrc !== null)

  useEffect(() => {
    thumbRequestKeyDone.current = null
    setGridDisplaySrc(null)
  }, [img.fullPath, img.vscodePath, thumbTargetMaxEdgePx])

  useEffect(() => {
    if (!isShow) {
      return
    }
    const reqKey = `${img.fullPath}\0${thumbTargetMaxEdgePx}`
    if (thumbRequestKeyDone.current === reqKey) {
      return
    }
    let cancelled = false
    callVscode(
      { cmd: MESSAGE_CMD.GET_THUMB_FOR_GRID, data: { filePath: img.fullPath, targetMaxEdgePx: thumbTargetMaxEdgePx } },
      (r: GridThumbCallback) => {
        if (cancelled) {
          return
        }
        thumbRequestKeyDone.current = reqKey
        if (!r) {
          setGridDisplaySrc(img.vscodePath)
          return
        }
        if (r.kind === 'thumb') {
          setGridDisplaySrc(r.thumbSrc)
          onThumbResolved?.(img.vscodePath, r.thumbSrc)
        } else {
          setGridDisplaySrc(img.vscodePath)
        }
      }
    )
    return () => {
      cancelled = true
    }
  }, [isShow, img.fullPath, img.fileName, img.size, img.vscodePath, enableLazyLoad, thumbTargetMaxEdgePx, onThumbResolved])

  useEffect(() => {
    if (!everAutoPreview && autoPreview && isShow && gridDisplaySrc != null) {
      setEverAutoPreview(true)
      requestAnimationFrame(() => {
        onOpenPreview()
        onAutoPreview()
      })
    }
  }, [autoPreview, everAutoPreview, isShow, gridDisplaySrc, onAutoPreview, onOpenPreview])

  const pad = thumbPadStyle(backgroundColor)
  const imgBg = imageInlineBackground(backgroundColor)

  return (
    <CellShell ref={shellRef}>
      {!isShow ? (
        <LoadingCenter>
          <Spin />
        </LoadingCenter>
      ) : gridDisplaySrc == null ? (
        <LoadingCenter style={pad}>
          <Spin />
        </LoadingCenter>
      ) : (
        <ImgFit style={pad} onClick={onOpenPreview} onMouseOver={handleMouseOver}>
          <Image
            alt={img.fileName}
            width='100%'
            height='100%'
            style={{
              maxWidth: '100%',
              maxHeight: '100%',
              width: '100%',
              height: '100%',
              objectFit: 'contain',
              backgroundColor: imgBg,
              pointerEvents: 'none'
            }}
            src={gridDisplaySrc}
            onLoad={() => setLatched(true)}
            preview={false}
          />
          <ThumbMask className='iv-thumb-mask'>
            <EyeOutlined style={{ fontSize: '18px' }} />
            {cellEdge >= MIN_SIZE_SHOW_PREVIEW_INFO && (
              <>
                <span style={{ fontSize: '12px' }}>Preview</span>
                {dimensions && (
                  <span style={{ fontSize: '11px', opacity: 0.8 }}>
                    {dimensions.width} × {dimensions.height}
                  </span>
                )}
                <span style={{ fontSize: '11px', opacity: 0.8 }}>{formatBytes(img.size)}</span>
              </>
            )}
          </ThumbMask>
        </ImgFit>
      )}
    </CellShell>
  )
}

export default ImageLazyLoad

function formatBytes(bytes: number, decimals: number = 1): string {
  if (bytes === 0) {
    return '0 Bytes'
  }
  const k = 1024
  const dm = decimals < 0 ? 0 : decimals
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i]
}
