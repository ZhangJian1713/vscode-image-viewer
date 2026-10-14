import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Breadcrumb,
  Button,
  Checkbox,
  Empty,
  Input,
  message,
  Popover,
  Select,
  Slider,
  Space,
  Spin,
  Switch,
  Tooltip
} from 'antd'
import {
  AppstoreOutlined,
  BarsOutlined,
  BgColorsOutlined,
  BorderOuterOutlined,
  DesktopOutlined,
  StopOutlined,
  MenuUnfoldOutlined,
  MoonOutlined,
  FilterOutlined,
  DownOutlined,
  ReloadOutlined,
  SearchOutlined,
  SettingOutlined,
  SunOutlined
} from '@ant-design/icons'
import { ImagePreview } from '../../vendor/right-image-preview'
import { PREVIEW_ZOOM_STOPS } from '../previewZoomStops'
import type { ImageItem } from '../../vendor/right-image-preview'
import type { IConfig } from '../../types'
import {
  BACKGROUND_COLOR_OPTIONS,
  BACKGROUND_TRANSPARENT,
  DEFAULT_BACKGROUND_COLOR,
  IMAGE_FILE_PATTERNS,
  MESSAGE_CMD
} from '../../constants'
import { BUILTIN_MESSAGE_CMD } from '@easy_vscode/core/lib/constants'
import { useWebviewTheme } from '../WebviewThemeContext'
import { useResourceCacheSlot } from '../resourceCache/ResourceCacheBoundary'
import { sameImageFsPath } from '../imageSort'
import { GALLERY_SORT_OPTIONS, gallerySortSelection, gallerySortFromSelection, sortGalleryImages } from './gallerySort'
import { callGalleryHost } from './galleryBridge'
import {
  buildGalleryFolderIndex,
  completeGalleryImages,
  folderAncestors,
  galleryRelativePath,
  imageFolder,
  isPathWithinFolder,
  normalizeGalleryPath,
  normalizedGalleryConfig,
  RawWorkspaceImage
} from './galleryModel'
import type { IImage } from './imageTypes'
import { FolderSidebar } from './FolderSidebar'
import { VirtualGallery } from './VirtualGallery'
import { MAX_GALLERY_COLUMNS } from './galleryLayout'
import type { GalleryFolderHighlight } from './galleryViewportFolders'
import { GallerySettingsModal } from './GallerySettingsModal'
import { AnnouncementBar } from './AnnouncementBar'
import './gallery.css'

export type { IImage } from './imageTypes'

const defaultConfig: IConfig = {
  showImageTypes: IMAGE_FILE_PATTERNS.map((pattern) => pattern.slice(1)),
  keyword: '',
  activeKey: [],
  backgroundColor: DEFAULT_BACKGROUND_COLOR,
  includeFolders: [],
  excludeFolders: [],
  imageSort: 'nameAsc',
  galleryGroupByFolder: true,
  imageGridColumns: 8,
  galleryLayout: 'fill',
  galleryCompact: false,
  gallerySidebarVisible: true,
  gallerySidebarWidth: 230,
  galleryIncludeSubfolders: true,
  galleryListThumbSize: 64,
  galleryShowFileSize: true
}

function commandPath(arg: unknown): string {
  if (typeof arg === 'string') {
    return arg
  }
  if (!arg || typeof arg !== 'object') {
    return ''
  }
  const value = arg as { fsPath?: string; path?: string }
  return value.fsPath || (value.path?.replace(/^\/([a-zA-Z]:\/)/, '$1') ?? '')
}

interface GalleryPayload {
  images: IImage[]
  projectPath: string
  rootPath: string
}
interface PreviewSession {
  id: number
  items: ImageItem[]
  index: number
}

const PreviewImages: React.FC = () => {
  const theme = useWebviewTheme()
  const setThemePreference = theme.setPreference
  const [config, setConfig] = useState<IConfig>(defaultConfig)
  const [hydrated, setHydrated] = useState(false)
  const [payload, setPayload] = useState<GalleryPayload>({ images: [], projectPath: '', rootPath: '' })
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [showSettings, setShowSettings] = useState(false)
  const [session, setSession] = useState<PreviewSession | null>(null)
  const [previewIndex, setPreviewIndex] = useState(0)
  const [thumbnailSizing, setThumbnailSizing] = useState({ imageEdge: 0, columns: 8 })
  const [viewportFolders, setViewportFolders] = useState<GalleryFolderHighlight | null>(null)
  const requestSequence = useRef(0)
  const previewSequence = useRef(0)
  const loadTimer = useRef<ReturnType<typeof setTimeout>>()
  const currentConfig = useRef(config)
  currentConfig.current = { ...config, uiTheme: theme.preference }
  const hydrationRef = useRef(false)
  const initialArg = (window as Window & { commandArgs?: unknown[] }).commandArgs?.[0]
  const scopeHint = useRef(commandPath(initialArg))
  const pendingPreview = useRef(scopeHint.current)

  const patchConfig = useCallback((patch: Partial<IConfig>) => setConfig((previous) => ({ ...previous, ...patch })), [])

  const refresh = useCallback(() => {
    const sequence = ++requestSequence.current
    setLoading(true)
    setLoadError('')
    clearTimeout(loadTimer.current)
    loadTimer.current = setTimeout(() => {
      if (sequence === requestSequence.current) {
        setLoading(false)
        setLoadError('Scanning is taking longer than expected. Try refreshing or scan a smaller folder.')
      }
    }, 60_000)
    callGalleryHost(
      { cmd: MESSAGE_CMD.GET_ALL_IMGS, data: { scopeHintFsPath: scopeHint.current } },
      (result: { imgs?: RawWorkspaceImage[]; projectPath?: string; scopePath?: string; error?: string }) => {
        if (sequence !== requestSequence.current) {
          return
        }
        clearTimeout(loadTimer.current)
        setLoading(false)
        if (result.error || !result.projectPath) {
          setLoadError(result.error || 'Unable to read this workspace')
          // 规则错误时仍提供目录侧栏，允许用户修正已保存的筛选表达式。
          if (result.projectPath) {
            setPayload({
              images: [],
              projectPath: result.projectPath,
              rootPath: result.scopePath || result.projectPath
            })
          }
          return
        }
        setPayload({
          images: completeGalleryImages(result.imgs || [], result.projectPath),
          projectPath: result.projectPath,
          rootPath: result.scopePath || result.projectPath
        })
      }
    )
  }, [])

  useEffect(() => {
    let active = true
    const sequenceState = requestSequence
    callGalleryHost({ cmd: MESSAGE_CMD.GET_CONFIG }, (stored: IConfig) => {
      if (!active) {
        return
      }
      setConfig({ ...defaultConfig, ...normalizedGalleryConfig(stored) })
      setThemePreference(stored.uiTheme || 'follow')
      hydrationRef.current = true
      setHydrated(true)
      refresh()
    })
    return () => {
      active = false
      sequenceState.current++
      clearTimeout(loadTimer.current)
    }
  }, [refresh, setThemePreference])

  useEffect(() => {
    if (!hydrated) {
      return
    }
    const timer = setTimeout(() => callGalleryHost({ cmd: MESSAGE_CMD.SAVE_CONFIG, data: currentConfig.current }), 350)
    return () => clearTimeout(timer)
  }, [config, hydrated, theme.preference])
  useEffect(
    () => () => {
      if (hydrationRef.current) {
        callGalleryHost({ cmd: MESSAGE_CMD.SAVE_CONFIG, data: currentConfig.current })
      }
    },
    []
  )

  useEffect(() => {
    const onReveal = (event: MessageEvent) => {
      if (event.data?.cmd !== BUILTIN_MESSAGE_CMD.REVEAL_WEBVIEW) {
        return
      }
      const nextPath = commandPath(event.data.data?.commandArgs?.[0])
      // An explicit cache cleanup reveals the existing panel without changing its browse scope.
      if (event.data.data?.commandArgs?.[0]?.__imageViewerCleanResourceCache) {
        return
      }
      scopeHint.current = nextPath
      pendingPreview.current = nextPath
      refresh()
    }
    window.addEventListener('message', onReveal)
    return () => window.removeEventListener('message', onReveal)
  }, [refresh])

  const fileTypes = useMemo(() => {
    const counts = new Map<string, number>()
    payload.images.forEach((image) => counts.set(image.fileType, (counts.get(image.fileType) || 0) + 1))
    return Array.from(counts).sort(([one], [other]) => one.localeCompare(other))
  }, [payload.images])
  const types = useMemo(
    () => new Set(config.showImageTypes.map((type) => type.replace(/^\./, '').toLowerCase())),
    [config.showImageTypes]
  )
  const typedImages = useMemo(
    () => payload.images.filter((image) => types.has(image.fileType)),
    [payload.images, types]
  )
  const folderIndex = useMemo(
    () => buildGalleryFolderIndex(typedImages, payload.rootPath || '/'),
    [typedImages, payload.rootPath]
  )
  const selectedFolder = useMemo(() => {
    let key = normalizeGalleryPath(config.gallerySelectedFolder || folderIndex.root)
    while (isPathWithinFolder(key, folderIndex.root) && !folderIndex.folders.has(key)) {
      const parent = key.slice(0, key.lastIndexOf('/')) || '/'
      if (parent === key) {
        break
      }
      key = parent
    }
    return folderIndex.folders.has(key) ? key : folderIndex.root
  }, [config.gallerySelectedFolder, folderIndex])
  const selectFolder = useCallback(
    (key: string) => {
      setViewportFolders(null)
      const expanded = Array.from(
        new Set([...(currentConfig.current.galleryExpandedFolders || []), ...folderAncestors(folderIndex, key)])
      )
      patchConfig({ gallerySelectedFolder: key, galleryExpandedFolders: expanded })
    },
    [folderIndex, patchConfig]
  )
  const scopedImages = useMemo(
    () =>
      sortGalleryImages(
        typedImages.filter((image) => {
          const folder = imageFolder(image)
          return config.galleryIncludeSubfolders
            ? isPathWithinFolder(folder, selectedFolder)
            : sameImageFsPath(folder, selectedFolder)
        }),
        config.imageSort || 'nameAsc',
        config.galleryGroupByFolder
      ),
    [typedImages, selectedFolder, config.galleryIncludeSubfolders, config.imageSort, config.galleryGroupByFolder]
  )
  const visibleImages = useMemo(() => {
    const query = config.keyword.toLowerCase()
    return query ? scopedImages.filter((image) => image.path.toLowerCase().includes(query)) : scopedImages
  }, [scopedImages, config.keyword])
  const visibleIndexes = useMemo(
    () => new Map(visibleImages.map((image, index) => [image.fullPath, index])),
    [visibleImages]
  )

  const openPreview = useCallback(
    (image: IImage, thumbnail?: string) => {
      const index = visibleIndexes.get(image.fullPath)
      if (index === undefined) {
        return
      }
      setPreviewIndex(index)
      setSession({
        id: ++previewSequence.current,
        index,
        items: visibleImages.map((item) => ({
          id: item.fullPath,
          src: item.vscodePath,
          minimapSrc: item.fullPath === image.fullPath && thumbnail !== item.vscodePath ? thumbnail : undefined,
          name: item.fileName,
          alt: item.fileName
        }))
      })
    },
    [visibleImages, visibleIndexes]
  )
  useEffect(() => {
    const pending = pendingPreview.current
    if (!pending || loading || !hydrated) {
      return
    }
    const image = payload.images.find((item) => sameImageFsPath(item.fullPath, pending))
    if (!image) {
      pendingPreview.current = ''
      return
    }
    if (!visibleIndexes.has(image.fullPath)) {
      patchConfig({
        gallerySelectedFolder: imageFolder(image),
        galleryIncludeSubfolders: false,
        keyword: '',
        showImageTypes: Array.from(new Set([...config.showImageTypes, image.fileType]))
      })
      return
    }
    pendingPreview.current = ''
    openPreview(image)
  }, [payload.images, loading, hydrated, visibleIndexes, config.showImageTypes, patchConfig, openPreview])
  const activePreview = session?.items[previewIndex]
  useResourceCacheSlot('gallery-main-image', activePreview?.src)
  useResourceCacheSlot('gallery-minimap-image', activePreview?.minimapSrc)

  const saveScopeSettings = useCallback(
    (includeFolders: string[], excludeFolders: string[]) => {
      const next = { ...currentConfig.current, includeFolders, excludeFolders }
      patchConfig({ includeFolders, excludeFolders })
      callGalleryHost({ cmd: MESSAGE_CMD.SAVE_CONFIG, data: next }, refresh)
    },
    [patchConfig, refresh]
  )
  const folderAction = useCallback(
    (key: string, action: string) => {
      if (action === 'exclude') {
        const relative = galleryRelativePath(key, payload.projectPath)
        if (!relative || key === folderIndex.root) {
          return
        }
        saveScopeSettings(config.includeFolders, Array.from(new Set([...config.excludeFolders, relative])))
        return
      }
      callGalleryHost({ cmd: MESSAGE_CMD.GALLERY_RESOURCE_ACTION, data: { filePath: key, action } }, (result) => {
        if (result?.ok === false) {
          message.error(result.error || 'Unable to complete the action')
        } else if (action.startsWith('copy')) {
          message.success('Copied successfully')
        }
      })
    },
    [config.includeFolders, config.excludeFolders, folderIndex.root, payload.projectPath, saveScopeSettings]
  )
  const revealFolder = useCallback((image: IImage) => selectFolder(imageFolder(image)), [selectFolder])
  const onDeleted = useCallback(
    (fullPath: string) =>
      setPayload((previous) => ({
        ...previous,
        images: previous.images.filter((image) => image.fullPath !== fullPath)
      })),
    []
  )
  const breadcrumbKeys = folderAncestors(folderIndex, selectedFolder)
  const scopeKey = `${selectedFolder}\0${config.galleryIncludeSubfolders}\0${config.keyword}\0${Array.from(types)
    .sort()
    .join(',')}`

  return (
    <div className='iv-gallery-app'>
      <AnnouncementBar hostUiLanguage={config.hostUiLanguage} />
      <div className='iv-gallery-body'>
        {config.gallerySidebarVisible && payload.rootPath && (
          <FolderSidebar
            index={folderIndex}
            selected={selectedFolder}
            viewportHighlight={config.galleryGroupByFolder ? viewportFolders : null}
            expanded={config.galleryExpandedFolders ?? [folderIndex.root]}
            recursive={config.galleryIncludeSubfolders}
            width={config.gallerySidebarWidth}
            onSelect={selectFolder}
            onExpanded={(keys) => patchConfig({ galleryExpandedFolders: keys })}
            onWidth={(width) => patchConfig({ gallerySidebarWidth: width })}
            onHide={() => patchConfig({ gallerySidebarVisible: false })}
            onRefresh={refresh}
            onRecursive={(galleryIncludeSubfolders) => patchConfig({ galleryIncludeSubfolders })}
            onAction={folderAction}
            includeFolders={config.includeFolders}
            excludeFolders={config.excludeFolders}
            onApplyFilters={saveScopeSettings}
          />
        )}
        <main className='iv-gallery-main'>
          <div className='iv-gallery-heading'>
            {!config.gallerySidebarVisible && (
              <Tooltip title='Show sidebar'>
                <Button
                  type='text'
                  icon={<MenuUnfoldOutlined />}
                  aria-label='Show sidebar'
                  onClick={() => patchConfig({ gallerySidebarVisible: true })}
                />
              </Tooltip>
            )}
            <Breadcrumb
              className='iv-gallery-breadcrumb'
              items={(payload.rootPath ? breadcrumbKeys : []).map((key) => ({
                title: (
                  <button title={key} onClick={() => selectFolder(key)}>
                    {folderIndex.folders.get(key)!.name}
                  </button>
                )
              }))}
            />
            <span className='iv-gallery-count'>
              {loading && <Spin size='small' />}
              {!payload.rootPath && loading ? 'Scanning…' : `${visibleImages.length.toLocaleString()} images`}
            </span>
          </div>
          <div className='iv-gallery-toolbar'>
            <Input
              prefix={<SearchOutlined />}
              placeholder='Search image path or name'
              value={config.keyword}
              allowClear
              onChange={(event) => patchConfig({ keyword: event.target.value })}
              aria-label='Search images'
              className='iv-gallery-search'
            />
            <Popover
              placement='bottom'
              trigger='click'
              content={
                <div className='iv-gallery-types'>
                  <Checkbox.Group
                    value={config.showImageTypes.map((type) => type.replace(/^\./, ''))}
                    options={fileTypes.map(([type, count]) => ({
                      value: type,
                      label: `${type.toUpperCase()} (${count})`
                    }))}
                    onChange={(values) => patchConfig({ showImageTypes: values.map(String) })}
                  />
                </div>
              }
            >
              <Button
                type='text'
                className='iv-gallery-filter-control'
                icon={<FilterOutlined />}
                aria-label='Filter image types'
              >
                Types <DownOutlined />
              </Button>
            </Popover>
            <Select
              aria-label='Sort images'
              value={gallerySortSelection(config.imageSort || 'nameAsc', config.galleryGroupByFolder)}
              options={GALLERY_SORT_OPTIONS}
              onChange={(value) => patchConfig(gallerySortFromSelection(value))}
              popupMatchSelectWidth={false}
              className='iv-gallery-sort'
              variant='borderless'
            />
            <Space size={2}>
              <Popover
                trigger='click'
                placement='bottom'
                content={
                  <div className='iv-gallery-backgrounds'>
                    {BACKGROUND_COLOR_OPTIONS.map((color) => (
                      <button
                        key={color}
                        className={config.backgroundColor === color ? 'is-selected' : ''}
                        title={color === BACKGROUND_TRANSPARENT ? 'No background' : color}
                        aria-label={`Background ${color === BACKGROUND_TRANSPARENT ? 'none' : color}`}
                        aria-pressed={config.backgroundColor === color}
                        style={{
                          background: color.startsWith('#')
                            ? color
                            : color === 'checkerboard'
                            ? 'repeating-conic-gradient(#ccc 0% 25%, #fff 0% 50%) 0 / 8px 8px'
                            : 'transparent'
                        }}
                        onClick={() => patchConfig({ backgroundColor: color })}
                      >
                        {color === BACKGROUND_TRANSPARENT && <StopOutlined />}
                      </button>
                    ))}
                  </div>
                }
              >
                <Button
                  type='text'
                  icon={<BgColorsOutlined />}
                  aria-label='Image background'
                  title='Image background'
                />
              </Popover>
              <Button
                type='text'
                icon={<ReloadOutlined spin={loading} />}
                aria-label='Refresh images'
                title='Refresh images'
                onClick={refresh}
              />
            </Space>
          </div>
          {loadError && (
            <div className='iv-gallery-error' role='alert'>
              {loadError}
            </div>
          )}
          {visibleImages.length ? (
            <VirtualGallery
              images={visibleImages}
              root={payload.rootPath}
              scopeKey={scopeKey}
              mode={config.galleryLayout}
              compact={config.galleryCompact}
              showFileSize={config.galleryShowFileSize}
              columns={config.imageGridColumns}
              listThumbSize={config.galleryListThumbSize}
              background={config.backgroundColor}
              onThumbnailSizing={setThumbnailSizing}
              onViewportFolders={setViewportFolders}
              hudRoot={selectedFolder}
              active={!session}
              groupByFolder={config.galleryGroupByFolder}
              onOpen={openPreview}
              onFolder={revealFolder}
              onDeleted={onDeleted}
            />
          ) : (
            <div className='iv-gallery-empty'>
              {loading ? (
                <div>
                  <Spin />
                  <p>Scanning images…</p>
                </div>
              ) : (
                <Empty
                  description={
                    payload.images.length ? 'No images match this folder and filters' : 'No images found in this folder'
                  }
                />
              )}
            </div>
          )}
          <footer className='iv-gallery-status'>
            <div className='iv-gallery-layouts' role='group' aria-label='Gallery layout'>
              {(
                [
                  { key: 'fill', label: 'Fill', icon: <BorderOuterOutlined /> },
                  { key: 'grid', label: 'Grid', icon: <AppstoreOutlined /> },
                  { key: 'list', label: 'List', icon: <BarsOutlined /> }
                ] as const
              ).map((layout) => (
                <Button
                  key={layout.key}
                  size='small'
                  type={config.galleryLayout === layout.key ? 'primary' : 'text'}
                  aria-pressed={config.galleryLayout === layout.key}
                  onClick={() => patchConfig({ galleryLayout: layout.key })}
                  icon={layout.icon}
                >
                  {layout.label}
                </Button>
              ))}
            </div>
            <label className='iv-gallery-compact'>
              <Switch
                size='small'
                checked={config.galleryCompact}
                aria-label='Compact mode'
                onChange={(galleryCompact) => patchConfig({ galleryCompact })}
              />{' '}
              Compact
            </label>
            <div className='iv-gallery-density'>
              <span>Thumbnails</span>
              <svg className='iv-gallery-density-icon' viewBox='0 0 16 16' aria-hidden='true'>
                <path d='M1 1h3v3H1zm5 0h3v3H6zm5 0h3v3h-3zM1 6h3v3H1zm5 0h3v3H6zm5 0h3v3h-3zM1 11h3v3H1zm5 0h3v3H6zm5 0h3v3h-3z' />
              </svg>
              <Slider
                ariaLabelForHandle='Thumbnail size'
                min={config.galleryLayout === 'list' ? 40 : 1}
                max={config.galleryLayout === 'list' ? 160 : MAX_GALLERY_COLUMNS}
                step={config.galleryLayout === 'list' ? 8 : 1}
                value={
                  config.galleryLayout === 'list'
                    ? config.galleryListThumbSize
                    : MAX_GALLERY_COLUMNS + 1 - config.imageGridColumns
                }
                tooltip={{
                  formatter: () =>
                    `${Math.round(thumbnailSizing.imageEdge)} px${
                      config.galleryLayout === 'list' ? '' : ` · ${thumbnailSizing.columns} ${thumbnailSizing.columns === 1 ? 'column' : 'columns'}`
                    }`
                }}
                ariaValueTextFormatterForHandle={() =>
                  `${Math.round(thumbnailSizing.imageEdge)} pixels${
                    config.galleryLayout === 'list' ? '' : `, ${thumbnailSizing.columns} ${thumbnailSizing.columns === 1 ? 'column' : 'columns'}`
                  }`
                }
                onChange={(value) =>
                  patchConfig(
                    config.galleryLayout === 'list'
                      ? { galleryListThumbSize: value }
                      : { imageGridColumns: MAX_GALLERY_COLUMNS + 1 - value }
                  )
                }
              />
              <svg className='iv-gallery-density-icon' viewBox='0 0 16 16' aria-hidden='true'>
                <path d='M1 1h5.5v5.5H1zm8 0h5.5v5.5H9zM1 9h5.5v5.5H1zm8 0h5.5v5.5H9z' />
              </svg>
              <span>{thumbnailSizing.imageEdge ? `${Math.round(thumbnailSizing.imageEdge)} px` : '—'}</span>
            </div>
            <div className='iv-gallery-footer-actions'>
              <span className='iv-gallery-total'>{payload.images.length.toLocaleString()} indexed</span>
              <Button
                type='text'
                size='small'
                icon={
                  theme.preference === 'follow' ? (
                    <DesktopOutlined />
                  ) : theme.preference === 'dark' ? (
                    <MoonOutlined />
                  ) : (
                    <SunOutlined />
                  )
                }
                aria-label='Change theme'
                title={`Theme: ${theme.preference === 'follow' ? 'Follow VS Code' : theme.preference === 'dark' ? 'Dark' : 'Light'}`}
                onClick={theme.cyclePreference}
              />
              <Button
                type='text'
                size='small'
                icon={<SettingOutlined />}
                aria-label='Settings'
                title='Settings'
                onClick={() => setShowSettings(true)}
              />
            </div>
          </footer>
        </main>
      </div>
      {showSettings && (
        <GallerySettingsModal config={config} onChange={patchConfig} onClose={() => setShowSettings(false)} />
      )}
      {session && (
        <ImagePreview
          key={session.id}
          images={session.items}
          defaultIndex={session.index}
          visible
          stops={PREVIEW_ZOOM_STOPS}
          wheelEnabled
          clickZoomEnabled
          doubleClickEnabled={false}
          showFlip
          arrows='both'
          closeOnMaskClick
          onIndexChange={setPreviewIndex}
          onClose={() => setSession(null)}
        />
      )}
    </div>
  )
}

export default PreviewImages
