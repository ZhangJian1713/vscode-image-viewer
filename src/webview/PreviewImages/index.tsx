import {
  Button,
  Checkbox,
  Collapse,
  ConfigProvider,
  Empty,
  Input,
  Select,
  Skeleton,
  Slider,
  Space,
  Spin,
  Tooltip
} from 'antd'
import {
  BgColorsOutlined,
  FolderOpenTwoTone,
  InfoCircleOutlined,
  MoonOutlined,
  SearchOutlined,
  SunOutlined
} from '@ant-design/icons'
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { ImagePreview } from 'right-image-preview'
import type { ImageGroup } from 'right-image-preview'
import {
  BACKGROUND_CHECKERBOARD,
  BACKGROUND_COLOR_OPTIONS,
  BACKGROUND_TRANSPARENT,
  DEFAULT_BACKGROUND_COLOR,
  MESSAGE_CMD
} from '../../constants'
import { callVscode } from '@easy_vscode/webview'
import { ThumbLoadBudgetProvider } from './thumbLoadBudget'
import {
  StyledBetweenWrapper,
  StyledFolderOpenTwoTone,
  StyledImgsContainer,
  StyledPicCount,
  StyledPreviewImages,
  StyledReloadOutlined,
  StyledSettingOutlined,
  StyledThemeToggle,
  StyleMainScrollSlot,
  StyleRowTitle,
  StyleSquare,
  StyleTopRows
} from './style'
import { IConfig, type ImageSortMode, type WebviewUiThemePreference } from 'types'
import SettingsModal from './SettingsModal'
import { useWebviewTheme } from '../WebviewThemeContext'
import {
  COLUMN_SLIDER_MAX,
  COLUMN_SLIDER_MIN,
  buildColumnSliderMarks,
  columnsFromApproxThumbWidth,
  columnsFromSliderPos,
  DEFAULT_COLUMN_LAYOUT_GUESS_PX,
  IMAGE_GRID_PAD_X,
  IMAGE_TILE_GAP,
  approxPersistedThumbSize,
  imagesPerRow,
  sliderPosFromColumns
} from '../imageGridColumns'
import { IMAGE_SORT_OPTIONS, compareImagesForSort } from '../imageSort'
import type { IImage } from './imageTypes'
import { VirtualFolderImageGrid } from './VirtualFolderImageGrid'
import { AnnouncementBar } from './AnnouncementBar'

export type { IImage } from './imageTypes'

const THRESHOLD_ALL_COLLAPSED = 1200
const THRESHOLD_ENABLE_LAZY_LOADING = 150
const THRESHOLD_DELAY_CHANGE_SIZE = 200
const REVEAL_WEBVIEW_MESSAGE = 'revealWebview'

const WORKSPACE_ROOT_DISPLAY = '(workspace root)'

/** UI label for project-relative dir; raw `path` keys (e.g. `/`) unchanged for logic. */
function formatRelativeDirDisplay(path: string): string {
  const trimmed = path.replace(/^\/|\/$/g, '')
  return trimmed === '' ? WORKSPACE_ROOT_DISPLAY : trimmed
}

/** Command argument as JSON-deserialized VS Code `Uri` or plain string; prefer `fsPath` when present. */
function commandArgToFsPath(arg: unknown): string {
  if (arg === undefined || arg === null) {
    return ''
  }
  if (typeof arg === 'string') {
    return arg
  }
  if (typeof arg === 'object') {
    const o = arg as { fsPath?: string; path?: string }
    if (typeof o.fsPath === 'string' && o.fsPath.length > 0) {
      return o.fsPath
    }
    if (typeof o.path === 'string' && o.path.length > 0) {
      const p = o.path
      if (/^\/[a-zA-Z]:\//.test(p)) {
        return p.slice(1).replace(/\//g, '\\')
      }
      return p
    }
  }
  return ''
}

function readWindowCommandScopeHint(): string | null {
  if (typeof window === 'undefined') {
    return null
  }
  const w = window as Window & { commandArgs?: unknown[] }
  const p = commandArgToFsPath(w.commandArgs?.[0])
  return p.length > 0 ? p : null
}

/** Tooltip for background swatches: specials in English; solid colors use stored hex (e.g. #ffffff). */
function backgroundSwatchTooltip(option: string): string {
  if (option === BACKGROUND_CHECKERBOARD) {
    return 'Checkerboard'
  }
  if (option === BACKGROUND_TRANSPARENT) {
    return 'Transparent'
  }
  return option
}

/** Host payload before paths and names are derived. */
type RawWorkspaceImage = Pick<IImage, 'path' | 'vscodePath' | 'size'> & {
  mtimeMs?: number
  fullPath?: string
}

/** Normalize config entries like `.jpg` to match {@link IImage.fileType} (no leading dot, lower case). */
function normalizeConfiguredImageTypes(types: string[]): string[] {
  return types.map((t) => String(t).replace(/^\./, '').toLowerCase())
}

const completeImgs = (imgs: RawWorkspaceImage[], projectPath: string): IImage[] => {
  const fallbackFullPath = (rel: string) => {
    const base = projectPath.replace(/[/\\]+$/, '')
    const tail = rel.replace(/^[/\\]+/, '')
    const sep = base.includes('\\') ? '\\' : '/'
    return `${base}${sep}${tail}`
  }
  return imgs.map((img) => {
    const filePath = img.path
    const dirPath = filePath.substring(0, filePath.lastIndexOf('/') + 1)
    const fileName = filePath.substring(filePath.lastIndexOf('/') + 1)
    const fileType = filePath.substring(filePath.lastIndexOf('.') + 1).toLowerCase()
    const newImg: IImage = {
      ...img,
      fullPath: img.fullPath && img.fullPath.length > 0 ? img.fullPath : fallbackFullPath(img.path),
      dirPath,
      fileName,
      fileType
    }
    return newImg
  })
}

const themeToggleIcon = (p: WebviewUiThemePreference) => {
  if (p === 'follow') {
    return <BgColorsOutlined />
  }
  if (p === 'light') {
    return <SunOutlined />
  }
  return <MoonOutlined />
}

const themeToggleTitle = (p: WebviewUiThemePreference) => {
  if (p === 'follow') {
    return 'Theme: follow VS Code (click to fix light)'
  }
  if (p === 'light') {
    return 'Theme: light (click for dark)'
  }
  return 'Theme: dark (click to follow VS Code)'
}

const PreviewImages: React.FC = () => {
  const { preference: uiThemePreference, setPreference: setUiThemePreference, cyclePreference } = useWebviewTheme()
  const configHydratedRef = useRef(false)
  const [imgs, setImgs] = useState<IImage[]>([])
  const [allImageTypes, setAllImageTypes] = useState<string[]>([])
  const [showImageTypes, setShowImageTypes] = useState<string[]>([])
  const [activeKey, setActiveKey] = useState<string[]>([])
  const [allPaths, setAllPaths] = useState<string[]>([])
  const [showImgs, setShowImgs] = useState<IImage[]>([])
  const [backgroundColor, setBackgroundColor] = useState<string>(DEFAULT_BACKGROUND_COLOR)
  const [keyword, setKeyword] = useState<string>('')
  const [beforeFetch, setBeforeFetch] = useState(true)
  const [loading, setLoading] = useState(false)
  /** Raw 0–100 slider value; drives the handle (never round-trip through column count only). */
  const [columnSliderPos, setColumnSliderPos] = useState<number>(() =>
    sliderPosFromColumns(columnsFromApproxThumbWidth(DEFAULT_COLUMN_LAYOUT_GUESS_PX))
  )
  /** Drives grid `size`; when image count is high, updates only on release to limit reflow. */
  const [layoutSliderPos, setLayoutSliderPos] = useState<number>(() =>
    sliderPosFromColumns(columnsFromApproxThumbWidth(DEFAULT_COLUMN_LAYOUT_GUESS_PX))
  )
  const scopeHintFsPathRef = useRef<string | null>(readWindowCommandScopeHint())
  const initClickFilePath =
    (typeof window !== 'undefined' && commandArgToFsPath(
      (window as Window & { commandArgs?: unknown[] }).commandArgs?.[0]
    )) ||
    ''
  const [clickFilePath, setClickFilePath] = useState<string>(initClickFilePath)
  const [everAutoPreview, setEverAutoPreview] = useState(false)
  const [showSettingsModal, setShowSettingsModal] = useState(false)
  const [includeFolders, setIncludeFolders] = useState<string[]>([])
  const [excludeFolders, setExcludeFolders] = useState<string[]>([])
  /** `vscode.env.language` from host `GET_CONFIG` (announcement modal locale). */
  const [hostUiLanguage, setHostUiLanguage] = useState<string | undefined>(undefined)
  const [imageSort, setImageSort] = useState<ImageSortMode>('nameAsc')
  const [gridInnerWidth, setGridInnerWidth] = useState(0)
  const fallbackLayoutWidthRef = useRef(DEFAULT_COLUMN_LAYOUT_GUESS_PX)
  const gridInnerWidthRef = useRef(0)
  const pendingLegacySizeRef = useRef<number | null>(null)
  /** True when config has neither `imageGridColumns` nor legacy `size`; apply once real width known. */
  const needWidthBasedColumnsRef = useRef(false)
  const currentProjectPath = useRef('')

  /** Lightbox (right-image-preview) state */
  const [lightboxVisible, setLightboxVisible] = useState(false)
  const [lightboxKey, setLightboxKey] = useState(0)
  const [lightboxDefaultIndex, setLightboxDefaultIndex] = useState(0)
  const [minimapSrcByVscodePath, setMinimapSrcByVscodePath] = useState<Record<string, string>>({})

  const ref = useRef<HTMLDivElement | null>(null)
  const [thumbIoGen, setThumbIoGen] = useState(0)
  /** Shared signal so per-folder virtual grids recalc visible rows without N×scroll listeners. */
  const [listScrollTick, setListScrollTick] = useState(0)
  const listScrollRafRef = useRef<number | null>(null)

  const setScrollContainerRef = useCallback((el: HTMLDivElement | null) => {
    ref.current = el
    if (el) {
      setThumbIoGen((g) => g + 1)
    }
  }, [])

  const onImageListScroll = useCallback(() => {
    if (listScrollRafRef.current !== null) {
      return
    }
    listScrollRafRef.current = requestAnimationFrame(() => {
      listScrollRafRef.current = null
      setListScrollTick((t) => t + 1)
    })
  }, [])

  useLayoutEffect(() => {
    if (allPaths.length === 0) {
      setGridInnerWidth(0)
      return
    }
    let cancelled = false
    let ro: ResizeObserver | null = null
    let raf = 0
    const attach = (el: HTMLElement) => {
      const read = () => {
        if (cancelled) {
          return
        }
        const w = el.clientWidth - IMAGE_GRID_PAD_X
        setGridInnerWidth(Math.max(0, w))
      }
      read()
      ro = new ResizeObserver(read)
      ro.observe(el)
    }
    const el = ref.current as HTMLElement | null
    if (el) {
      attach(el)
    } else {
      raf = requestAnimationFrame(() => {
        const el2 = ref.current as HTMLElement | null
        if (el2 && !cancelled) {
          attach(el2)
        }
      })
    }
    return () => {
      cancelled = true
      if (raf) {
        cancelAnimationFrame(raf)
      }
      ro?.disconnect()
    }
  }, [allPaths.length])

  const refreshImgs = useCallback(() => {
    setLoading(true)
    const hint = scopeHintFsPathRef.current
    callVscode(
      {
        cmd: MESSAGE_CMD.GET_ALL_IMGS,
        ...(hint ? { data: { scopeHintFsPath: hint } } : {})
      },
      ({ imgs, projectPath }: { imgs: RawWorkspaceImage[]; projectPath: string }) => {
        currentProjectPath.current = projectPath
        setLoading(false)
        setBeforeFetch(false)
        updateImgs(imgs)
      }
    )
  }, [])
  useEffect(refreshImgs, [refreshImgs])

  const onRevealWebview = useCallback(
    (event: MessageEvent) => {
      const message = event?.data
      if (message?.cmd === REVEAL_WEBVIEW_MESSAGE) {
        const commandArgs = message.data?.commandArgs as unknown[] | undefined
        const nextPath = commandArgToFsPath(commandArgs?.[0])
        setClickFilePath(nextPath)
        scopeHintFsPathRef.current = nextPath.length > 0 ? nextPath : null
        setEverAutoPreview(false)
        refreshImgs()
      }
    },
    [refreshImgs]
  )

  useEffect(() => {
    window.addEventListener('message', onRevealWebview)
    return () => {
      window.removeEventListener('message', onRevealWebview)
    }
  }, [onRevealWebview])

  const updateImgs = (newImgs: RawWorkspaceImage[]) => {
    const imgs = completeImgs(newImgs, currentProjectPath.current)
    setImgs(imgs)
    let allFileTypes: string[] = imgs.map((img) => img.fileType)
    allFileTypes = Array.from(new Set(allFileTypes)).sort()
    setAllImageTypes([...allFileTypes])
    setShowImageTypes([...allFileTypes])
  }

  useEffect(() => {
    let showImgs = imgs
    showImgs = showImgs
      .filter((img) => img.path.indexOf(keyword) > -1)
      .filter((img) => showImageTypes.includes(img.fileType))
    setShowImgs(showImgs)
    let arr: string[] = showImgs.map((img) => img.dirPath)
    arr = Array.from(new Set(arr)).sort()
    setAllPaths(arr)
    const isVeryMany = showImgs.length > THRESHOLD_ALL_COLLAPSED
    setActiveKey(isVeryMany ? [] : [...arr])
  }, [imgs, keyword, showImageTypes])

  const onDeleteImage = useCallback((filePath: string) => {
    setImgs((prev) => prev.filter((img) => img.fullPath !== filePath))
  }, [])

  const handleClickOpenFolder = (e, path: string) => {
    e.stopPropagation()
    callVscode({
      cmd: MESSAGE_CMD.OPEN_IMAGE_DIRECTORY,
      data: { path }
    })
  }

  const typeOptions = useMemo(() => {
    const counts = new Map<string, number>()
    for (const img of imgs) {
      counts.set(img.fileType, (counts.get(img.fileType) ?? 0) + 1)
    }
    return allImageTypes.map((type) => ({
      label: (
        <span>
          {type}
          <StyledPicCount style={{ marginLeft: '4px' }}>({counts.get(type) ?? 0})</StyledPicCount>
        </span>
      ),
      value: type
    }))
  }, [allImageTypes, imgs])

  const handleChangeActiveKey = (value) => {
    setActiveKey([].concat(value))
  }

  const customizeRenderEmpty = () => {
    if (beforeFetch) {
      return <Skeleton active />
    }
    return (
      <div style={{ textAlign: 'center' }}>
        <Empty description='No images found' />
      </div>
    )
  }

  const layoutWidthForSizing = gridInnerWidth > 0 ? gridInnerWidth : fallbackLayoutWidthRef.current
  const imageGridColumns = useMemo(
    () =>
      columnsFromSliderPos(
        imgs.length >= THRESHOLD_DELAY_CHANGE_SIZE ? layoutSliderPos : columnSliderPos
      ),
    [imgs.length, layoutSliderPos, columnSliderPos]
  )
  /** Legacy config `size` only; layout is CSS grid × `imageGridColumns`. */
  const size = useMemo(
    () => approxPersistedThumbSize(layoutWidthForSizing, imageGridColumns),
    [layoutWidthForSizing, imageGridColumns]
  )

  useEffect(() => {
    if (gridInnerWidth > 0) {
      fallbackLayoutWidthRef.current = gridInnerWidth
    }
    gridInnerWidthRef.current = gridInnerWidth
  }, [gridInnerWidth])

  useEffect(() => {
    if (gridInnerWidth <= 0) {
      return
    }

    const legacy = pendingLegacySizeRef.current
    if (legacy !== null) {
      const cols = imagesPerRow(gridInnerWidth, legacy, IMAGE_TILE_GAP, 0)
      const snapped = sliderPosFromColumns(Math.min(50, Math.max(1, cols)))
      setColumnSliderPos(snapped)
      setLayoutSliderPos(snapped)
      pendingLegacySizeRef.current = null
      needWidthBasedColumnsRef.current = false
      return
    }

    if (needWidthBasedColumnsRef.current) {
      const c = columnsFromApproxThumbWidth(gridInnerWidth)
      const snapped = sliderPosFromColumns(c)
      setColumnSliderPos(snapped)
      setLayoutSliderPos(snapped)
      needWidthBasedColumnsRef.current = false
    }
  }, [gridInnerWidth])

  const handlerChangeGridColumns = (pos: number) => {
    setColumnSliderPos(pos)
    if (imgs.length < THRESHOLD_DELAY_CHANGE_SIZE) {
      setLayoutSliderPos(pos)
    }
  }
  const handlerAfterChangeGridColumns = (pos: number) => {
    const snapped = sliderPosFromColumns(columnsFromSliderPos(pos))
    setColumnSliderPos(snapped)
    setLayoutSliderPos(snapped)
  }

  const enableLazyLoad = useMemo(() => {
    return showImgs.length > THRESHOLD_ENABLE_LAZY_LOADING
  }, [showImgs])

  const columnSliderMarks = useMemo(() => buildColumnSliderMarks(), [])

  /** One pass: group by dir + sort each list (avoids O(panels × N) filter/sort per render). */
  const sortedImagesByDir = useMemo(() => {
    const map = new Map<string, IImage[]>()
    for (const img of showImgs) {
      let list = map.get(img.dirPath)
      if (!list) {
        list = []
        map.set(img.dirPath, list)
      }
      list.push(img)
    }
    for (const list of map.values()) {
      list.sort((a, b) => compareImagesForSort(imageSort, clickFilePath, a, b))
    }
    return map
  }, [showImgs, imageSort, clickFilePath])

  /**
   * Flat list for lightbox: same folder order as the Collapse panel headers, so ← / → navigates
   * across folders in the same visual order the user sees.
   */
  const globalPreviewFlat = useMemo(() => {
    const out: IImage[] = []
    for (const dirPath of allPaths) {
      const list = sortedImagesByDir.get(dirPath)
      if (list?.length) {
        out.push(...list)
      }
    }
    return out
  }, [allPaths, sortedImagesByDir])

  useEffect(() => {
    const valid = new Set(globalPreviewFlat.map((img) => img.vscodePath))
    setMinimapSrcByVscodePath((prev) => {
      let changed = false
      const next: Record<string, string> = {}
      for (const [k, v] of Object.entries(prev)) {
        if (valid.has(k)) {
          next[k] = v
        } else {
          changed = true
        }
      }
      return changed ? next : prev
    })
  }, [globalPreviewFlat])

  /** Global flat index keyed by vscodePath — used to find the clicked image's index. */
  const globalIndexByVscodePath = useMemo(() => {
    const m = new Map<string, number>()
    for (let i = 0; i < globalPreviewFlat.length; i++) {
      m.set(globalPreviewFlat[i].vscodePath, i)
    }
    return m
  }, [globalPreviewFlat])

  /** ImageGroup[] for right-image-preview groupedImages mode — one group per folder, in allPaths order. */
  const lightboxGroups = useMemo<ImageGroup[]>(() => {
    const groups: ImageGroup[] = []
    for (const dirPath of allPaths) {
      const list = sortedImagesByDir.get(dirPath)
      if (list?.length) {
        groups.push({
          name: formatRelativeDirDisplay(dirPath),
          images: list.map((img) => ({
            id: img.vscodePath,
            src: img.vscodePath,
            minimapSrc: minimapSrcByVscodePath[img.vscodePath],
            name: img.fileName,
            alt: img.fileName
          }))
        })
      }
    }
    return groups
  }, [allPaths, sortedImagesByDir, minimapSrcByVscodePath])

  const handleOpenPreview = useCallback(
    (img: IImage) => {
      const idx = globalIndexByVscodePath.get(img.vscodePath) ?? 0
      setLightboxDefaultIndex(idx)
      setLightboxKey((k) => k + 1)
      setLightboxVisible(true)
    },
    [globalIndexByVscodePath]
  )

  const handleThumbResolved = useCallback((vscodePath: string, thumbSrc: string) => {
    if (!vscodePath || !thumbSrc) {
      return
    }
    setMinimapSrcByVscodePath((prev) => {
      if (prev[vscodePath] === thumbSrc) {
        return prev
      }
      return { ...prev, [vscodePath]: thumbSrc }
    })
  }, [])

  /** One `setActiveKey` (no Spin overlay). rAF so the click frame stays light before the big commit. */
  const handleExpandAllFolders = useCallback(() => {
    const keys = [...allPaths]
    if (keys.length === 0) {
      return
    }
    requestAnimationFrame(() => {
      setActiveKey(keys)
    })
  }, [allPaths])

  const onAutoPreview = useCallback(() => {
    setEverAutoPreview(true)
  }, [])

  /**
   * save to local config file
   */
  useEffect(() => {
    callVscode({
      cmd: MESSAGE_CMD.GET_CONFIG,
    }, (data: IConfig) => {
      setBackgroundColor(data.backgroundColor ?? DEFAULT_BACKGROUND_COLOR)
      const igc = data.imageGridColumns
      if (typeof igc === 'number' && igc >= 1 && igc <= 50) {
        const snapped = sliderPosFromColumns(Math.round(igc))
        setColumnSliderPos(snapped)
        setLayoutSliderPos(snapped)
        pendingLegacySizeRef.current = null
        needWidthBasedColumnsRef.current = false
      } else {
        pendingLegacySizeRef.current = typeof data.size === 'number' ? data.size : null
        needWidthBasedColumnsRef.current = pendingLegacySizeRef.current === null
      }

      if (needWidthBasedColumnsRef.current && gridInnerWidthRef.current > 0) {
        const snapped = sliderPosFromColumns(columnsFromApproxThumbWidth(gridInnerWidthRef.current))
        setColumnSliderPos(snapped)
        setLayoutSliderPos(snapped)
        needWidthBasedColumnsRef.current = false
      }
      setShowImageTypes(normalizeConfiguredImageTypes(data.showImageTypes ?? []))
      setKeyword(data.keyword)
      setActiveKey(data.activeKey)
      setIncludeFolders(data.includeFolders)
      setExcludeFolders(data.excludeFolders)
      setUiThemePreference(data.uiTheme ?? 'follow')
      setImageSort(data.imageSort ?? 'nameAsc')
      setHostUiLanguage(typeof data.hostUiLanguage === 'string' ? data.hostUiLanguage : undefined)
      configHydratedRef.current = true
    })
  }, [setUiThemePreference])

  /**
   * save to local config file
   */
  useEffect(() => {
    callVscode({
      cmd: MESSAGE_CMD.SAVE_CONFIG,
      data: {
        backgroundColor,
        size,
        imageGridColumns,
        showImageTypes,
        keyword,
        activeKey,
        imageSort
      }
    })
  }, [showImageTypes, backgroundColor, size, imageGridColumns, activeKey, keyword, imageSort])

  useEffect(() => {
    if (!configHydratedRef.current) {
      return
    }
    callVscode({
      cmd: MESSAGE_CMD.SAVE_CONFIG,
      data: { uiTheme: uiThemePreference }
    })
  }, [uiThemePreference])

  const handleCycleUiTheme = useCallback(() => {
    configHydratedRef.current = true
    cyclePreference()
  }, [cyclePreference])

  /**
   * save to local config file and refresh images
   */
  useEffect(() => {
    callVscode({
      cmd: MESSAGE_CMD.SAVE_CONFIG,
      data: {
        includeFolders,
        excludeFolders
      }
    }, refreshImgs)
  }, [includeFolders, excludeFolders, refreshImgs])

  const handleClickSettings = () => {
    setShowSettingsModal(true)
  }

  const handleApplySettings = (includeFolders: string[], excludeFolders: string[]) => {
    setIncludeFolders(includeFolders)
    setExcludeFolders(excludeFolders)
  }

  return (
    <ConfigProvider renderEmpty={customizeRenderEmpty}>
      <>
      <div className='iv-preview-root'>
      <Spin spinning={loading}>
        <AnnouncementBar hostUiLanguage={hostUiLanguage} />
        <StyledPreviewImages
          style={{
            padding: '10px 20px 20px 20px'
          }}
        >
          <StyleTopRows>
            <Input
              addonBefore={<SearchOutlined />}
              allowClear
              size='middle'
              placeholder='image path/name'
              style={{ width: 'calc(100% - 92px)', marginRight: '8px' }}
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
            />
            <StyledReloadOutlined onClick={refreshImgs} />
            <StyledSettingOutlined onClick={handleClickSettings} />
            <Tooltip title={themeToggleTitle(uiThemePreference)}>
              <StyledThemeToggle onClick={handleCycleUiTheme} role='button' aria-label='Toggle UI theme'>
                {themeToggleIcon(uiThemePreference)}
              </StyledThemeToggle>
            </Tooltip>
          </StyleTopRows>
          {/* Type */}
          <StyleTopRows style={{ marginBottom: '2px' }}>
            <StyledBetweenWrapper>
              <span>
                <StyleRowTitle>Type:</StyleRowTitle>
                <Checkbox.Group
                  options={typeOptions}
                  value={[...showImageTypes]}
                  onChange={(values) => setShowImageTypes(values as string[])}
                />
              </span>
              <span>
                Total count:<StyledPicCount style={{ marginLeft: '6px' }}>{imgs.length}</StyledPicCount>
              </span>
            </StyledBetweenWrapper>
          </StyleTopRows>
          {/* Background */}
          <StyleTopRows style={{ marginBottom: '6px' }}>
            <StyleRowTitle>Background:</StyleRowTitle>
            <span>
              {BACKGROUND_COLOR_OPTIONS.map((opt) => (
                <Tooltip key={opt} title={backgroundSwatchTooltip(opt)} mouseEnterDelay={0.35}>
                  <StyleSquare
                    onClick={() => setBackgroundColor(opt)}
                    isSelected={backgroundColor === opt}
                    color={opt}
                  />
                </Tooltip>
              ))}
            </span>
          </StyleTopRows>
          {/* Columns → pixel size derived from panel width */}
          <StyleTopRows style={{ display: 'flex', alignItems: 'center', marginBottom: '4px' }}>
            <StyleRowTitle>Columns:</StyleRowTitle>
            <Tooltip title='Images per row (1–50). Pixel size follows panel width. Tick labels: every column through 10, then every 5 columns.'>
              <Slider
                style={{ flex: 1 }}
                min={COLUMN_SLIDER_MIN}
                max={COLUMN_SLIDER_MAX}
                step={0.01}
                marks={columnSliderMarks}
                value={columnSliderPos}
                tooltip={{ formatter: (v) => String(columnsFromSliderPos(Number(v))) }}
                onChange={handlerChangeGridColumns}
                onAfterChange={handlerAfterChangeGridColumns}
                aria-label='Images per row'
              />
            </Tooltip>
          </StyleTopRows>
          {/* Expand/Collapse All */}
          <StyleTopRows>
            <StyledBetweenWrapper>
              <Space>
                <span style={{ color: 'var(--iv-secondary-fg, var(--vscode-descriptionForeground))' }}>
                  Search result:{' '}
                  <span style={{ color: 'var(--iv-primary-fg, var(--vscode-foreground))', fontWeight: 600 }}>
                    {showImgs.length}
                  </span>
                </span>
                <Tooltip
                  placement='right'
                  title={`When there are more than ${THRESHOLD_ALL_COLLAPSED} images(after being filtered) being displayed, all directories are collapsed by default.`}
                >
                  <InfoCircleOutlined
                    style={{ fontSize: '16px', color: 'var(--iv-icon-muted, var(--vscode-descriptionForeground))' }}
                  />
                </Tooltip>
                <Button onClick={handleExpandAllFolders}>Expand All</Button>
                <Button onClick={() => setActiveKey([])}>Collapse All</Button>
                <Tooltip title='Applies inside each folder only; folder order is unchanged.'>
                  <Select<ImageSortMode>
                    aria-label='Sort images within folder'
                    value={imageSort}
                    onChange={setImageSort}
                    options={IMAGE_SORT_OPTIONS}
                    popupMatchSelectWidth={false}
                    style={{ minWidth: 300 }}
                  />
                </Tooltip>
              </Space>
            </StyledBetweenWrapper>
          </StyleTopRows>
          <StyleMainScrollSlot>
            <StyledImgsContainer ref={setScrollContainerRef} onScroll={onImageListScroll}>
              {allPaths.length === 0 ? (
                customizeRenderEmpty()
              ) : (
                <ThumbLoadBudgetProvider scrollRootRef={ref} ioGeneration={thumbIoGen} gridColumns={imageGridColumns}>
                  <Collapse activeKey={activeKey} onChange={handleChangeActiveKey}>
                    {allPaths.map((path) => {
                      const imgsInPanel = sortedImagesByDir.get(path) ?? []
                      const panelOpen = activeKey.includes(path)
                      return (
                        <Collapse.Panel
                          header={
                            <span>
                              {formatRelativeDirDisplay(path)}
                              <StyledPicCount>({imgsInPanel.length})</StyledPicCount>
                              <StyledFolderOpenTwoTone>
                                <FolderOpenTwoTone
                                  twoToneColor='#f4d057'
                                  onClick={(e) => handleClickOpenFolder(e, path)}
                                />
                              </StyledFolderOpenTwoTone>
                            </span>
                          }
                          key={path}
                        >
                          {panelOpen ? (
                            <VirtualFolderImageGrid
                              scrollTick={listScrollTick}
                              scrollRootRef={ref}
                              listInnerWidth={layoutWidthForSizing}
                              columns={imageGridColumns}
                              imgs={imgsInPanel}
                              backgroundColor={backgroundColor}
                              enableLazyLoad={enableLazyLoad}
                              everAutoPreview={everAutoPreview}
                              clickFilePath={clickFilePath}
                              onAutoPreview={onAutoPreview}
                              onDeleteImage={onDeleteImage}
                              onOpenPreview={handleOpenPreview}
                              onThumbResolved={handleThumbResolved}
                            />
                          ) : null}
                        </Collapse.Panel>
                      )
                    })}
                  </Collapse>
                </ThumbLoadBudgetProvider>
              )}
            </StyledImgsContainer>
          </StyleMainScrollSlot>
        </StyledPreviewImages>
      </Spin>
      </div>
      {showSettingsModal && (
        <SettingsModal
          includeFolders={includeFolders}
          excludeFolders={excludeFolders}
          visible={showSettingsModal}
          onClose={() => setShowSettingsModal(false)}
          onApply={handleApplySettings}
        />
      )}
      <ImagePreview
        key={lightboxKey}
        groupedImages={lightboxGroups.length > 0 ? lightboxGroups : undefined}
        visible={lightboxVisible}
        defaultIndex={lightboxDefaultIndex}
        wheelEnabled
        doubleClickEnabled
        closeOnMaskClick
        arrows='side'
        showFlip
        onClose={() => setLightboxVisible(false)}
      />
      </>
    </ConfigProvider>
  )
}

export default PreviewImages
