/** Webview UI: follow VS Code, or force light/dark (Ant Design + page chrome). */
export type WebviewUiThemePreference = 'follow' | 'light' | 'dark'

/** Secondary order when grouped by folder, or the order of the entire gallery. */
export type ImageSortMode = 'nameAsc' | 'nameDesc' | 'mtimeAsc' | 'mtimeDesc' | 'sizeAsc' | 'sizeDesc' | 'typeAsc' | 'typeDesc'

export type GalleryLayoutMode = 'grid' | 'fill' | 'list'

export interface IConfig {
  showImageTypes: string[]
  keyword: string
  activeKey: string[]
  backgroundColor: string
  /** Legacy pixel hint; optional when only `imageGridColumns` / width-based default is used. */
  size?: number
  /** 1–20; primary control for thumbnail grid. `size` is kept in sync for older configs. */
  imageGridColumns?: number
  includeFolders: string[]
  excludeFolders: string[]
  uiTheme?: WebviewUiThemePreference
  imageSort?: ImageSortMode
  /** Defaults to true for new and legacy configs; folders keep ascending tree order. */
  galleryGroupByFolder?: boolean
  /** Defaults to Grid when absent; preserve the user's saved layout. */
  galleryLayout?: GalleryLayoutMode
  galleryCompact?: boolean
  gallerySidebarVisible?: boolean
  gallerySidebarWidth?: number
  galleryIncludeSubfolders?: boolean
  gallerySelectedFolder?: string
  galleryExpandedFolders?: string[]
  galleryListThumbSize?: number
  /** Normal Fill/Grid captions: show file size below the name; tooltip always includes size. */
  galleryShowFileSize?: boolean
  /**
   * Injected by the extension only in `GET_CONFIG` responses (`vscode.env.language`);
   * never persisted to the local config file.
   */
  hostUiLanguage?: string
}
