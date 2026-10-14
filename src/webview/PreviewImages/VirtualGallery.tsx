import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Dropdown, Modal, message } from 'antd'
import { MoreOutlined } from '@ant-design/icons'
import type { GalleryLayoutMode } from '../../types'
import type { IImage } from './imageTypes'
import { thumbDecodeMaxEdgeFromCellWidth } from '../../config/gridThumb'
import { MESSAGE_CMD } from '../../constants'
import { callGalleryHost } from './galleryBridge'
import { galleryGeometry, galleryWindow, formatImageBytes, galleryScrollHeight, galleryLogicalScrollTop, galleryPhysicalScrollTop, GalleryGeometry } from './galleryLayout'
import { galleryRelativePath } from './galleryModel'
import { GalleryThumbnailStore } from './galleryThumbnailStore'
import { GalleryThumbnail, useGalleryThumbnail } from './GalleryThumbnail'
import { useGalleryScrollbarGesture } from './useGalleryScrollbarGesture'
import { visibleGalleryFolders, GalleryFolderHighlight } from './galleryViewportFolders'
import { ScrollbarFolderHud } from './ScrollbarFolderHud'
import { useLogicalGalleryScroll } from './useLogicalGalleryScroll'

type ImageAction = 'copyFullPath' | 'copyRelativePath' | 'copyName' | 'copyBase64' | 'revealInExplorer' | 'deleteFile'

function runImageAction(image: IImage, action: ImageAction, onDeleted: (_path: string) => void): void {
  // eslint-disable-line no-unused-vars
  const execute = () =>
    new Promise<void>((resolve, reject) => {
      callGalleryHost(
        { cmd: MESSAGE_CMD.GALLERY_RESOURCE_ACTION, data: { filePath: image.fullPath, action } },
        (result) => {
          if (result?.ok === false) {
            message.error(result.error || 'Unable to complete the action')
            reject(new Error(result.error))
            return
          }
          if (action === 'deleteFile') {
            onDeleted(image.fullPath)
          } else if (action.startsWith('copy')) {
            message.success('Copied successfully')
          }
          resolve()
        }
      )
    })
  if (action === 'deleteFile') {
    Modal.confirm({
      title: `Move “${image.fileName}” to Trash?`,
      content:
        'The original file will be moved to the system Trash or Recycle Bin. Some remote file systems may not support this operation.',
      okText: 'Move to Trash',
      cancelText: 'Cancel',
      okButtonProps: { danger: true },
      onOk: execute
    })
  } else {
    void execute().catch(() => {})
  }
}

interface GalleryCardProps {
  image: IImage
  store: GalleryThumbnailStore
  root: string
  mode: GalleryLayoutMode
  compact: boolean
  showFileSize: boolean
  background: string
  tier: number
  imageEdge: number
  x: number
  y: number
  width: number
  height: number
  priority: number
  narrow: number
  onOpen: (_image: IImage, _thumbnail?: string) => void
  onFolder: (_image: IImage) => void
  onDeleted: (_path: string) => void
}

/* eslint-disable no-unused-vars -- callback signatures above */
const GalleryCard = React.memo(function GalleryCard(props: GalleryCardProps) {
  const {
    image,
    store,
    root,
    mode,
    compact,
    showFileSize,
    background,
    tier,
    imageEdge,
    x,
    y,
    width,
    height,
    priority,
    narrow,
    onOpen,
    onFolder,
    onDeleted
  } = props
  const list = mode === 'list'
  const snapshot = useGalleryThumbnail(store, image, tier, priority, list && priority >= 1000)
  const relative = galleryRelativePath(image.fullPath, root)
  const pixels = snapshot.dimensions ? `${snapshot.dimensions.width} × ${snapshot.dimensions.height}` : '—'
  const menu = {
    items: [
      { key: 'revealInExplorer', label: 'Reveal in Explorer' },
      { key: 'browseFolder', label: 'Browse containing folder' },
      { type: 'divider' as const },
      { key: 'copyFullPath', label: 'Copy full path' },
      { key: 'copyRelativePath', label: 'Copy project-relative path' },
      { key: 'copyName', label: 'Copy file name' },
      { key: 'copyBase64', label: 'Copy Base64 data' },
      { type: 'divider' as const },
      { key: 'deleteFile', label: 'Move to Trash…', danger: true }
    ],
    onClick: ({ key, domEvent }) => {
      domEvent.stopPropagation()
      if (key === 'browseFolder') {
        onFolder(image)
      } else {
        runImageAction(image, key as ImageAction, onDeleted)
      }
    }
  }
  const columns = `${imageEdge}px minmax(0,1fr)${narrow < 3 ? ' 78px' : ''}${narrow < 2 ? ' 112px' : ''}${
    narrow < 1 ? ' 148px' : ''
  } 28px`
  return (
    <Dropdown menu={menu} trigger={['contextMenu']} getPopupContainer={() => document.body}>
      <div
        className={`iv-gallery-card ${list ? 'iv-gallery-list-row' : ''} ${compact ? 'is-compact' : ''}`}
        data-image-id={image.fullPath}
        role='button'
        tabIndex={0}
        aria-label={`Preview ${image.fileName}`}
        title={`${relative}\n${formatImageBytes(image.size)}${snapshot.dimensions ? ` · ${pixels}` : ''}`}
        style={{
          position: 'absolute',
          left: x,
          top: y,
          width,
          height,
          ...(list ? { gridTemplateColumns: columns } : {})
        }}
        onClick={() => onOpen(image, snapshot.src || undefined)}
        onKeyDown={(event) => {
          if (event.target !== event.currentTarget) {
            return
          }
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            onOpen(image, snapshot.src || undefined)
          }
        }}
      >
        <div className='iv-gallery-image-box' style={{ height: imageEdge, ...(list ? { width: imageEdge } : {}) }}>
          <GalleryThumbnail
            image={image}
            snapshot={snapshot}
            store={store}
            tier={tier}
            fill={mode === 'fill'}
            background={background}
          />
        </div>
        {list ? (
          <>
            <div className='iv-list-name'>
              <strong>{image.fileName}</strong>
              <span>{relative}</span>
            </div>
            {narrow < 3 && <span className='iv-list-value'>{formatImageBytes(image.size)}</span>}
            {narrow < 2 && <span className='iv-list-value'>{pixels}</span>}
            {narrow < 1 && (
              <span className='iv-list-value'>{image.mtimeMs ? new Date(image.mtimeMs).toLocaleString() : '—'}</span>
            )}
          </>
        ) : !compact ? (
          <div className='iv-gallery-caption' style={{ height: showFileSize ? 40 : 26 }}>
            <span>{image.fileName}</span>
            {showFileSize && <small>{formatImageBytes(image.size)}</small>}
          </div>
        ) : (
          <span className='iv-compact-caption'>{image.fileName}</span>
        )}
        <Dropdown menu={menu} trigger={['click']} getPopupContainer={() => document.body}>
          <button
            className='iv-image-menu'
            aria-label={`Actions for ${image.fileName}`}
            onClick={(event) => event.stopPropagation()}
          >
            <MoreOutlined />
          </button>
        </Dropdown>
      </div>
    </Dropdown>
  )
})
/* eslint-enable no-unused-vars */

export const VirtualGallery: React.FC<{
  images: IImage[]
  root: string
  scopeKey: string
  mode: GalleryLayoutMode
  compact: boolean
  showFileSize: boolean
  columns: number
  listThumbSize: number
  background: string
  onThumbnailSizing: (_sizing: { imageEdge: number; columns: number }) => void
  onViewportFolders: (_highlight: GalleryFolderHighlight | null) => void
  hudRoot: string
  active: boolean
  groupByFolder: boolean
  onOpen: (_image: IImage, _thumbnail?: string) => void
  onFolder: (_image: IImage) => void
  onDeleted: (_path: string) => void
}> = ({
  images,
  root,
  scopeKey,
  mode,
  compact,
  showFileSize,
  columns,
  listThumbSize,
  background,
  onThumbnailSizing,
  onViewportFolders,
  hudRoot,
  active,
  groupByFolder,
  onOpen,
  onFolder,
  onDeleted
}) => {
  const scrollRef = useRef<HTMLDivElement>(null)
  const liveScrollTop = useRef(0)
  const currentGeometry = useRef<GalleryGeometry>()
  useLogicalGalleryScroll(scrollRef, currentGeometry)
  const [viewport, setViewport] = useState({ width: 800, height: 0, scrollTop: 0 })
  const frame = useRef(0)
  const gestureReset = useMemo(() => ({ images, scopeKey, groupByFolder }), [images, scopeKey, groupByFolder])
  const gesture = useGalleryScrollbarGesture(scrollRef, active && groupByFolder, gestureReset)
  const suppressLayoutScroll = gesture.suppressLayoutScroll
  const store = useMemo(() => new GalleryThumbnailStore(callGalleryHost), [])
  useEffect(() => () => store.destroy(), [store])

  const measure = useCallback(() => {
    const element = scrollRef.current
    if (!element) {
      return
    }
    const next = { width: element.clientWidth, height: element.clientHeight,
      scrollTop: galleryLogicalScrollTop(element.scrollTop, currentGeometry.current?.totalHeight || 0, element.clientHeight) }
    setViewport((previous) =>
      previous.width === next.width && previous.height === next.height && previous.scrollTop === next.scrollTop
        ? previous
        : next
    )
  }, [])
  const scheduleMeasure = useCallback(() => {
    if (frame.current) {
      return
    }
    frame.current = requestAnimationFrame(() => {
      frame.current = 0
      measure()
    })
  }, [measure])
  useLayoutEffect(() => {
    measure()
    const observer = new ResizeObserver(scheduleMeasure)
    observer.observe(scrollRef.current!)
    return () => {
      observer.disconnect()
      cancelAnimationFrame(frame.current)
    }
  }, [measure, scheduleMeasure])

  const geometry = useMemo(
    () => galleryGeometry(images.length, viewport.width, columns, mode, compact, listThumbSize, showFileSize),
    [images.length, viewport.width, columns, mode, compact, listThumbSize, showFileSize]
  )
  currentGeometry.current = geometry
  // Report layout dimensions, never scrolling state; the footer does not render on each scroll frame.
  useLayoutEffect(() => {
    onThumbnailSizing({ imageEdge: geometry.imageEdge, columns: geometry.columns })
  }, [geometry.imageEdge, geometry.columns, onThumbnailSizing])
  const indexes = useMemo(() => new Map(images.map((image, index) => [image.fullPath, index])), [images])
  const previous = useRef<{ images: IImage[]; geometry: typeof geometry; scopeKey: string }>()
  const savedPositions = useRef(new Map<string, { path?: string; index: number; fraction: number; atTop: boolean }>())

  useLayoutEffect(() => {
    const element = scrollRef.current!
    const old = previous.current
    if (old) {
      // 新布局提交后浏览器可能已夹紧 scrollTop；用滚动事件保存的旧值定位原图片。
      const oldTop = liveScrollTop.current
      const row = Math.max(0, Math.floor((oldTop - old.geometry.padding) / old.geometry.rowStride))
      const index = Math.min(old.images.length - 1, row * old.geometry.columns)
      const anchor = {
        path: old.images[index]?.fullPath,
        index: Math.max(0, index),
        fraction: (oldTop - old.geometry.padding - row * old.geometry.rowStride) / old.geometry.rowStride,
        atTop: oldTop <= old.geometry.padding
      }
      savedPositions.current.set(old.scopeKey, anchor)
      while (savedPositions.current.size > 50) {
        savedPositions.current.delete(savedPositions.current.keys().next().value)
      }
      const restore = old.scopeKey === scopeKey ? anchor : savedPositions.current.get(scopeKey)
      const newIndex = restore?.path
        ? indexes.get(restore.path) ?? Math.min(restore.index, Math.max(0, images.length - 1))
        : 0
      suppressLayoutScroll()
      const logicalTop =
        !restore || restore.atTop
          ? 0
          : Math.max(
              0,
              geometry.padding +
                Math.floor(newIndex / geometry.columns) * geometry.rowStride +
                restore.fraction * geometry.rowStride
            )
      element.scrollTop = galleryPhysicalScrollTop(logicalTop, geometry.totalHeight, element.clientHeight)
      liveScrollTop.current = galleryLogicalScrollTop(element.scrollTop, geometry.totalHeight, element.clientHeight)
      measure()
    }
    previous.current = { images, geometry, scopeKey }
  }, [images, geometry, scopeKey, indexes, measure, suppressLayoutScroll])

  const viewportFolders = useMemo(
    () => groupByFolder && gesture.dragging ? visibleGalleryFolders(images, geometry, viewport.scrollTop, viewport.height) : [],
    [groupByFolder, gesture.dragging, images, geometry, viewport.scrollTop, viewport.height]
  )
  const foldersKey = viewportFolders.join('\0')
  const lastDragFolders = useRef<string[]>([])
  const wasDragging = useRef(false)
  useEffect(() => {
    lastDragFolders.current = []
    wasDragging.current = false
    onViewportFolders(null)
  }, [gestureReset, onViewportFolders])
  useEffect(() => {
    if (!groupByFolder) {
      return
    }
    if (gesture.dragging) {
      lastDragFolders.current = viewportFolders
      onViewportFolders({ live: true, paths: viewportFolders })
    } else if (wasDragging.current) {
      onViewportFolders({ live: false, paths: lastDragFolders.current })
    }
    wasDragging.current = gesture.dragging
    // 路径签名未变时，不因 scrollTop 每帧变化重绘目录树。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupByFolder, gesture.dragging, foldersKey, onViewportFolders])

  const windowRows = galleryWindow(geometry, viewport.scrollTop, viewport.height)
  const start = windowRows.start * geometry.columns
  const end = Math.min(images.length, windowRows.end * geometry.columns)
  const tier = thumbDecodeMaxEdgeFromCellWidth(geometry.imageEdge * Math.min(2, window.devicePixelRatio || 1))
  const narrow = viewport.width < 320 ? 3 : viewport.width < 480 ? 2 : viewport.width < 700 ? 1 : 0
  const listColumns = `${geometry.imageEdge}px minmax(0,1fr)${narrow < 3 ? ' 78px' : ''}${narrow < 2 ? ' 112px' : ''}${
    narrow < 1 ? ' 148px' : ''
  } 28px`

  return (
    <div className='iv-gallery-wall' data-layout={mode} data-compact={compact}>
      {mode === 'list' && (
        <div
          className='iv-gallery-list-header'
          style={{ gridTemplateColumns: listColumns, padding: `0 ${geometry.padding + 8}px` }}
        >
          <span />
          <span>Name</span>
          {narrow < 3 && <span>Size</span>}
          {narrow < 2 && <span>Pixels</span>}
          {narrow < 1 && <span>Modified</span>}
          <span />
        </div>
      )}
      <div className='iv-gallery-scroll-host'>
      <div
        className='iv-gallery-scroll iv-image-list-scroll'
        ref={scrollRef}
        onScroll={(event) => {
          liveScrollTop.current = galleryLogicalScrollTop(event.currentTarget.scrollTop, geometry.totalHeight, event.currentTarget.clientHeight)
          gesture.onScroll(event.currentTarget.scrollTop)
          scheduleMeasure()
        }}
        role='region'
        tabIndex={0}
        aria-label='Image gallery'
      >
        <div
          className='iv-gallery-virtual-space'
          style={{ position: 'relative', height: galleryScrollHeight(geometry.totalHeight) }}
          data-total-count={images.length}
          data-mounted-count={end - start}
        >
          {images.slice(start, end).map((image, offset) => {
            const index = start + offset
            const row = Math.floor(index / geometry.columns)
            const y = geometry.padding + row * geometry.rowStride
            const visible = y + geometry.rowHeight >= viewport.scrollTop && y <= viewport.scrollTop + viewport.height
            return (
              <GalleryCard
                key={image.fullPath}
                image={image}
                store={store}
                root={root}
                mode={mode}
                compact={compact}
                showFileSize={showFileSize}
                background={background}
                tier={tier}
                imageEdge={geometry.imageEdge}
                x={geometry.padding + (index % geometry.columns) * (geometry.imageEdge + geometry.gap)}
                y={y - viewport.scrollTop + galleryPhysicalScrollTop(viewport.scrollTop, geometry.totalHeight, viewport.height)}
                width={mode === 'list' ? Math.max(1, viewport.width - geometry.padding * 2) : geometry.imageEdge}
                height={geometry.rowHeight}
                priority={visible ? 1000 : 500}
                narrow={narrow}
                onOpen={onOpen}
                onFolder={onFolder}
                onDeleted={onDeleted}
              />
            )
          })}
        </div>
      </div>
      <ScrollbarFolderHud
        paths={gesture.dragging ? viewportFolders : lastDragFolders.current}
        root={hudRoot}
        top={viewport.scrollTop}
        contentHeight={geometry.totalHeight}
        height={viewport.height}
        visible={gesture.hudVisible && active && groupByFolder}
      />
      </div>
    </div>
  )
}
