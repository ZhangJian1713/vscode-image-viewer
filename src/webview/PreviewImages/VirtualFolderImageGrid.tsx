/**
 * Windowed grid for one folder: only visible rows mount cells.
 * Full-size preview uses the outer `PreviewImages` `Image.PreviewGroup` and global `items` so the lightbox spans folders.
 */
import React, { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { IImage } from './imageTypes'
import { thumbDecodeMaxEdgeFromCellWidth } from '../../config/gridThumb'
import { IMAGE_GRID_SHOW_FILENAME_MAX_COLS, IMAGE_TILE_GAP, gridSquareCellWidthPx } from '../imageGridColumns'
import { sameImageFsPath } from '../imageSort'
import ImageInfo from './ImageInfo'
import ImageLazyLoad from './ImageLazyLoad'
import { StyleImage, StyleImageList } from './style'

/** Space under square thumb (ImageInfo margin + line-clamp × line-height); zero when column count is very high. */
const CAPTION_BELOW_PX_FULL = 52
/** Extra rows above/below viewport. */
const ROW_OVERSCAN = 2
/** Below this count, render a flat map (same DOM as before virtualizer existed). */
const MIN_IMAGES_FOR_VIRTUAL = 40

/* Callback parameter name is only for documentation. */
/* eslint-disable no-unused-vars -- type-only parameter names */
export interface VirtualFolderImageGridProps {
  /** Bumped on main list scroll so all open folders recompute visible rows (single listener on parent). */
  scrollTick: number
  scrollRootRef: React.RefObject<HTMLDivElement | null>
  listInnerWidth: number
  columns: number
  imgs: IImage[]
  backgroundColor: string
  enableLazyLoad: boolean
  everAutoPreview: boolean
  clickFilePath: string
  onAutoPreview: () => void
  onDeleteImage: (fullPath: string) => void
  /** Open the external lightbox at the image's global index. */
  onOpenPreview: (img: IImage) => void
  /** Receive resolved grid thumbnail URL for lightbox minimap. */
  onThumbResolved?: (vscodePath: string, thumbSrc: string) => void
}
/* eslint-enable no-unused-vars */

function scrollContentOffsetOfElement(el: HTMLElement, scroller: HTMLElement): number {
  const er = el.getBoundingClientRect()
  const sr = scroller.getBoundingClientRect()
  return er.top - sr.top + scroller.scrollTop
}

export const VirtualFolderImageGrid: React.FC<VirtualFolderImageGridProps> = ({
  scrollTick,
  scrollRootRef,
  listInnerWidth,
  columns: cols,
  imgs,
  backgroundColor,
  enableLazyLoad,
  everAutoPreview,
  clickFilePath,
  onAutoPreview,
  onDeleteImage,
  onOpenPreview,
  onThumbResolved
}) => {
  const wrapRef = useRef<HTMLDivElement | null>(null)
  const [win, setWin] = useState({ startRow: 0, endRow: 0 })

  const gap = IMAGE_TILE_GAP
  const cellW = gridSquareCellWidthPx(listInnerWidth, cols)
  const thumbTargetMaxEdgePx = useMemo(() => thumbDecodeMaxEdgeFromCellWidth(cellW), [cellW])
  const showFileCaption = cols <= IMAGE_GRID_SHOW_FILENAME_MAX_COLS
  const captionBelowPx = showFileCaption ? CAPTION_BELOW_PX_FULL : 0
  /** One row: thumb square + caption; gap between rows is `IMAGE_TILE_GAP` (same as StyleImageList). */
  const rowBody = cellW + captionBelowPx
  const rowStride = rowBody + gap
  const rowCount = Math.max(0, Math.ceil(imgs.length / cols))
  const totalHeight = rowCount > 0 ? rowCount * rowBody + Math.max(0, rowCount - 1) * gap : 0

  const computeWindow = useCallback(() => {
    const sc = scrollRootRef.current
    const wrap = wrapRef.current
    if (!sc || !wrap || rowCount === 0) {
      setWin({ startRow: 0, endRow: Math.max(0, rowCount - 1) })
      return
    }
    const top = scrollContentOffsetOfElement(wrap, sc)
    const st = sc.scrollTop
    const vh = sc.clientHeight
    const y0 = st - top
    const y1 = st + vh - top
    let startRow = Math.floor(y0 / rowStride) - ROW_OVERSCAN
    let endRow = Math.ceil(y1 / rowStride) + ROW_OVERSCAN
    if (!Number.isFinite(startRow)) {
      startRow = 0
    }
    if (!Number.isFinite(endRow)) {
      endRow = 0
    }
    startRow = Math.max(0, startRow)
    endRow = Math.min(rowCount - 1, endRow)
    if (endRow < startRow) {
      endRow = startRow
    }
    setWin((prev) => (prev.startRow === startRow && prev.endRow === endRow ? prev : { startRow, endRow }))
  }, [scrollRootRef, rowCount, rowStride])

  const rafRef = useRef<number | null>(null)
  const scheduleCompute = useCallback(() => {
    if (rafRef.current !== null) {
      return
    }
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null
      computeWindow()
    })
  }, [computeWindow])

  useLayoutEffect(() => {
    computeWindow()
  }, [computeWindow, scrollTick, imgs.length, cols, listInnerWidth])

  useLayoutEffect(() => {
    const wrap = wrapRef.current
    if (!wrap) {
      return
    }
    const ro = new ResizeObserver(scheduleCompute)
    ro.observe(wrap)
    return () => {
      ro.disconnect()
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current)
        rafRef.current = null
      }
    }
  }, [scheduleCompute, totalHeight, imgs.length, cols])

  if (imgs.length === 0) {
    return null
  }

  const useVirtual = imgs.length >= MIN_IMAGES_FOR_VIRTUAL

  if (!useVirtual) {
    return (
      <StyleImageList style={{ ['--iv-grid-cols']: String(cols) } as React.CSSProperties}>
        {imgs.map((img, indexInFolder) => (
          <StyleImage key={img.path}>
            <ImageLazyLoad
              enableLazyLoad={enableLazyLoad}
              img={img}
              backgroundColor={backgroundColor}
              autoPreview={!everAutoPreview && sameImageFsPath(clickFilePath, img.fullPath)}
              onAutoPreview={onAutoPreview}
              onOpenPreview={() => onOpenPreview(img)}
              indexInFolder={indexInFolder}
              imageGridColumns={cols}
              thumbTargetMaxEdgePx={thumbTargetMaxEdgePx}
              onThumbResolved={onThumbResolved}
            />
            <ImageInfo img={img} onDeleteImage={onDeleteImage} showFileName={showFileCaption} />
          </StyleImage>
        ))}
      </StyleImageList>
    )
  }

  const rows: number[] = []
  for (let r = win.startRow; r <= win.endRow; r++) {
    rows.push(r)
  }

  return (
    <div className='iv-virtual-folder-grid' style={{ width: '100%' }}>
      <div ref={wrapRef} style={{ position: 'relative', height: totalHeight, minHeight: totalHeight, width: '100%' }}>
        <div
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: win.startRow * rowStride
          }}
        >
          {rows.map((rowIdx) => (
            <div
              key={rowIdx}
              style={{
                display: 'grid',
                gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
                columnGap: gap,
                rowGap: 0,
                minHeight: rowBody,
                boxSizing: 'border-box',
                alignItems: 'start',
                marginBottom: rowIdx < rowCount - 1 ? gap : 0
              }}
            >
              {Array.from({ length: cols }, (_, c) => {
                const i = rowIdx * cols + c
                if (i >= imgs.length) {
                  return <div key={`empty-${rowIdx}-${c}`} />
                }
                const img = imgs[i]
                return (
                  <StyleImage key={img.path}>
                    <ImageLazyLoad
                      enableLazyLoad={enableLazyLoad}
                      img={img}
                      backgroundColor={backgroundColor}
                      autoPreview={!everAutoPreview && sameImageFsPath(clickFilePath, img.fullPath)}
                      onAutoPreview={onAutoPreview}
                      onOpenPreview={() => onOpenPreview(img)}
                      indexInFolder={i}
                      imageGridColumns={cols}
                      thumbTargetMaxEdgePx={thumbTargetMaxEdgePx}
                      onThumbResolved={onThumbResolved}
                    />
                    <ImageInfo img={img} onDeleteImage={onDeleteImage} showFileName={showFileCaption} />
                  </StyleImage>
                )
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
