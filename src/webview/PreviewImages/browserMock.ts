import { ANNOUNCEMENT_DISMISS_STORAGE_KEY, ANNOUNCEMENT_ID } from './announcementConfig'
import { compileFolderFilters } from '../../folderFilterRules'
import { VSCODE_DEFAULT_COLORS } from '../vscodeDefaultColors'
import type { IConfig } from '../../types'
import { IMAGE_FILE_PATTERNS, MESSAGE_CMD } from '../../constants'
import { GalleryMessage, GalleryTransport } from './galleryBridge'
import type { RawWorkspaceImage } from './galleryModel'


/** Explicit development-only fixture. No external images, local file access, or real deletions. */
export function installGalleryMock(): void {
  const params = new URLSearchParams(location.search)
  const count = Math.max(1, Math.min(200_000, Number(params.get('count')) || 10_000))
  const folderCount = Math.max(1, Math.min(5000, Number(params.get('folders')) || 80))
  const projectPath = '/demo/image-project'
  const session = params.get('mockSession')?.slice(0, 80)
  const key = `image-viewer.gallery-browser-mock-v1${session ? `:${session}` : ''}`
  const imageScale = Math.max(1, Math.min(4, Number(params.get('imageScale')) || 1))
  const defaults: IConfig = {
    showImageTypes: IMAGE_FILE_PATTERNS.map((pattern) => pattern.slice(1)),
    keyword: '',
    activeKey: [],
    backgroundColor: 'transparent',
    includeFolders: [],
    excludeFolders: [],
    imageGridColumns: 8,
    imageSort: 'nameAsc',
    galleryGroupByFolder: true,
    galleryLayout: 'grid',
    uiTheme: 'dark'
  }
  let config = defaults
  try {
    config = { ...defaults, ...JSON.parse(localStorage.getItem(key) || '{}') }
  } catch {
    /* A damaged dev preference never prevents opening the fixture. */
  }
  const sources = Array.from({ length: 36 }, (_, index) => {
    const hue = (index * 37) % 360
    const icon = index % 5 === 0
    const svg = icon
      ? `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400"><rect x="70" y="70" width="260" height="260" rx="65" fill="hsl(${hue},65%,60%)"/><path d="M125 210l50 50 100-125" stroke="white" stroke-width="20" fill="none"/></svg>`
      : `<svg xmlns="http://www.w3.org/2000/svg" width="${index % 3 ? 1000 : 650}" height="${
          index % 3 ? 650 : 1000
        }"><defs><linearGradient id="g" x2="1" y2="1"><stop stop-color="hsl(${hue},45%,35%)"/><stop offset="1" stop-color="hsl(${
          (hue + 55) % 360
        },60%,75%)"/></linearGradient></defs><rect width="100%" height="100%" fill="url(#g)"/><circle cx="750" cy="160" r="75" fill="#fff" opacity=".7"/><path d="M-50 650L330 250 600 560 840 350 1100 700z" fill="#112a37" opacity=".55"/><path d="M-80 1000L260 460 620 810 970 550 1100 1100z" fill="#092025" opacity=".8"/></svg>`
    const sizedSvg = svg.replace(/width="(\d+)" height="(\d+)"/, (_match, width, height) =>
      `width="${Number(width) * imageScale}" height="${Number(height) * imageScale}" viewBox="0 0 ${width} ${height}"`)
    return `data:image/svg+xml,${encodeURIComponent(sizedSvg)}`
  })
  let images: RawWorkspaceImage[] = Array.from({ length: count }, (_, index) => {
    const folder = index % folderCount
    const extension = ['jpg', 'png', 'webp', 'svg'][index % 4]
    const path =
      index % 97 === 0
        ? `/root-image-${index}.${extension}`
        : `/assets/${
            folder % 4 === 0 ? 'icons' : folder % 4 === 1 ? 'photos' : folder % 4 === 2 ? 'screenshots' : 'exports'
          }/set-${String(folder).padStart(3, '0')}/${index % 3 === 0 ? 'nested/' : ''}image-${String(index).padStart(
            6,
            '0'
          )}.${extension}`
    return {
      path,
      fullPath: projectPath + path,
      vscodePath: sources[index % sources.length],
      size: 1200 + (index % 300) * 9000,
      mtimeMs: 1_770_000_000_000 + index * 60_000
    }
  })
  const byPath = new Map(images.map((image) => [image.fullPath, image]))
  const requestedEntry = params.get('entry')
  if (requestedEntry) {
    const targetPath = projectPath + '/' + requestedEntry.replace(/^\/+/, '')
    ;(window as any).commandArgs = [{ __imageViewerEntry: true, rootPath: projectPath, targetPath,
      kind: byPath.has(targetPath) ? 'image' : /\.[^/]+$/.test(targetPath) ? 'file' : 'folder' }]
  }
  const stats = {
    thumbnails: 0,
    dimensions: 0,
    scans: 0,
    saves: 0,
    actions: [] as unknown[],
    inFlight: 0,
    maxInFlight: 0
  }
  const transport: GalleryTransport = (request: GalleryMessage, callback) => {
    let value: unknown
    switch (request.cmd) {
      case MESSAGE_CMD.GET_CONFIG:
        value = { ...config, hostUiLanguage: 'en' }
        break
      case MESSAGE_CMD.SAVE_CONFIG:
        config = { ...config, ...(request.data as IConfig) }
        localStorage.setItem(key, JSON.stringify(config))
        stats.saves++
        value = { ok: true }
        break
      case MESSAGE_CMD.GET_ALL_IMGS: {
        stats.scans++
        const requestId = (request.data as { requestId?: number })?.requestId
        try {
          const filters = compileFolderFilters(config.includeFolders, config.excludeFolders)
          const folders = new Map<string, boolean>()
          value = {
            projectPath,
            scopePath: projectPath,
            requestId,
            complete: true,
            imgs: images.filter((image) => {
              const directory = image.path.slice(1, image.path.lastIndexOf('/'))
              if (!folders.has(directory)) {
                folders.set(directory, filters.includes(directory) && !filters.excludes(directory))
              }
              return folders.get(directory)
            })
          }
        } catch (error) {
          value = { projectPath, scopePath: projectPath, requestId, complete: true,
            error: error instanceof Error ? error.message : String(error) }
        }
        break
      }
      case MESSAGE_CMD.RESOLVE_GALLERY_ENTRY: {
        const targetPath = (request.data as { targetPath: string }).targetPath
        const image = byPath.get(targetPath)
        value = { entry: { __imageViewerEntry: true, rootPath: projectPath, targetPath,
          kind: image ? 'image' : /\.[^/]+$/.test(targetPath) ? 'file' : 'folder' }, image }
        break
      }
      case MESSAGE_CMD.GET_THUMB_FOR_GRID: {
        stats.thumbnails++
        const image = byPath.get((request.data as { filePath: string }).filePath)
        value = image ? { kind: 'thumb', thumbSrc: image.vscodePath } : null
        stats.inFlight++
        stats.maxInFlight = Math.max(stats.maxInFlight, stats.inFlight)
        break
      }
      case MESSAGE_CMD.GET_IMAGE_SIZE:
        stats.dimensions++
        value = { width: 6000, height: 4000 }
        break
      case MESSAGE_CMD.GALLERY_RESOURCE_ACTION: {
        const data = request.data as { filePath: string; action: string }
        stats.actions.push(data)
        if (data.action === 'deleteFile') {
          images = images.filter((image) => image.fullPath !== data.filePath)
        }
        value = { ok: true }
        break
      }
      default:
        value = { ok: true }
    }
    setTimeout(
      () => {
        if (request.cmd === MESSAGE_CMD.GET_THUMB_FOR_GRID) {
          stats.inFlight--
        }
        callback?.(value)
      },
      request.cmd === MESSAGE_CMD.GET_ALL_IMGS ? 80 : 12
    )
  }
  ;(window as Window & { imageViewerMockTransport?: GalleryTransport }).imageViewerMockTransport = transport
  ;(window as any).imageViewerMock = { stats, getConfig: () => config }
  localStorage.setItem(ANNOUNCEMENT_DISMISS_STORAGE_KEY, ANNOUNCEMENT_ID)
  const mockTheme = params.get('mockTheme') || 'dark'
  const light = mockTheme === 'light'
  document.body.classList.remove('vscode-light', 'vscode-dark')
  document.body.classList.add(light ? 'vscode-light' : 'vscode-dark')
  document.body.setAttribute('data-vscode-theme-kind', light ? 'vscode-light' : 'vscode-dark')
  const colors: Record<string, string> = { ...VSCODE_DEFAULT_COLORS[light ? 'light' : 'dark'] }
  if (mockTheme === 'purple') {
    Object.assign(colors, {
      'editor.background': '#21152d',
      'editor.foreground': '#eee4fa',
      foreground: '#eee4fa',
      'sideBar.background': '#2b1b3a',
      'sideBar.foreground': '#eee4fa',
      'input.background': '#352242',
      'dropdown.background': '#352242',
      'input.foreground': '#eee4fa',
      'dropdown.foreground': '#eee4fa',
      'button.background': '#9860cb',
      'button.hoverBackground': '#a775d3',
      'textLink.foreground': '#c595ec',
      focusBorder: '#bd8ae4',
      'list.activeSelectionBackground': '#583272',
      'widget.border': '#5b386f'
    })
  }
  Object.entries(colors).forEach(([key, value]) =>
    document.body.style.setProperty(`--vscode-${key.replace(/\./g, '-')}`, value)
  )
}
