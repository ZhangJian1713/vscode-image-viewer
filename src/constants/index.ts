/* eslint-disable @typescript-eslint/naming-convention */

export const DIST_WEBVIEW_PATH = 'distWebview'
export const DIST_WEBVIEW_INDEX_HTML = `${DIST_WEBVIEW_PATH}/index.html`
export const DIST_WEBVIEW_SINGLE_INDEX_HTML = `${DIST_WEBVIEW_PATH}/single.html`

export const WEBVIEW_NAMES = {
  PreviewImages: 'PreviewImages',
  SingleImageViewer: 'SingleImageViewer',
}

export const MESSAGE_CMD = {
  TOGGLE_WINDOW_FULLSCREEN: 'toggleWindowFullscreen',
  GET_FILMSTRIP_STATE: 'getFilmstripState',
  SET_FILMSTRIP_STATE: 'setFilmstripState',
  GET_FILMSTRIP_THUMBNAIL: 'getFilmstripThumbnail',
  GET_UI_LANGUAGE: 'getUiLanguage',
  SET_UI_LANGUAGE: 'setUiLanguage',
  UI_LANGUAGE_CHANGED: 'uiLanguageChanged',
  GET_PREVIEW_PREFERENCES: 'getPreviewPreferences',
  SET_PREVIEW_PREFERENCES: 'setPreviewPreferences',
  PREVIEW_PREFERENCES_CHANGED: 'previewPreferencesChanged',
  // image viewer
  GET_ALL_IMGS: 'getAllImgs',
  GALLERY_SCAN_PROGRESS: 'galleryScanProgress',
  GALLERY_FILES_CHANGED: 'galleryFilesChanged',
  RESOLVE_GALLERY_ENTRY: 'resolveGalleryEntry',
  GET_IMAGE_SIZE: 'getImageSize',
  /** Explicit gallery file/folder menu action; extension validates workspace boundaries. */
  GALLERY_RESOURCE_ACTION: 'galleryResourceAction',
  /** Grid-only thumbnail: disk cache in globalStorage + webview URI, or original. */
  GET_THUMB_FOR_GRID: 'getThumbForGrid',
  SAVE_CONFIG: 'saveConfig',
  GET_CONFIG: 'getConfig',
  /** Host-owned GitHub and email feedback destinations only. */
  OPEN_FEEDBACK: 'openFeedback',
  /** Close the custom-editor tab when the direct image viewer is dismissed. */
  CLOSE_CUSTOM_IMAGE_EDITOR: 'closeCustomImageEditor',
  /** Result of a user-requested same-origin CacheStorage cleanup. */
  RESOURCE_CACHE_CLEANUP_RESULT: 'resourceCacheCleanupResult',
}

export const EXTENSION_NAME = 'vscode-infra'
export const IMAGE_EDITOR_VIEW_TYPE = `${EXTENSION_NAME}.imageViewer`

export const IMAGE_FILE_PATTERNS = [
  '*.svg',
  '*.png',
  '*.jpeg',
  '*.jpg',
  '*.ico',
  '*.gif',
  '*.webp',
  '*.bmp',
  '*.tif',
  '*.tiff',
  '*.apng',
  '*.avif'
]

export const EXTENSION_COMMANDS = {
  OPEN_WEBVIEW_IMAGE_VIEWER: `${EXTENSION_NAME}.webviewImageViewer`,
  SET_AS_DEFAULT_IMAGE_VIEWER: `${EXTENSION_NAME}.setAsDefaultImageViewer`,
  RESTORE_BUILT_IN_IMAGE_VIEWER: `${EXTENSION_NAME}.restoreBuiltInImageViewer`,
  CLEAN_WEBVIEW_IMAGE_CACHE: `${EXTENSION_NAME}.cleanWebviewImageCache`,
}

/** Internal command argument used to make the existing gallery origin run a forced cleanup. */
export const RESOURCE_CACHE_CLEANUP_ARG = '__imageViewerCleanResourceCache'


/** Thumbnail pad uses PS-style transparency grid (stored in config). */
export const BACKGROUND_CHECKERBOARD = 'checkerboard'

/** No thumbnail backdrop or frame — the gallery background shows through. */
export const BACKGROUND_TRANSPARENT = 'transparent'

export const BACKGROUND_COLOR_OPTIONS = [
  BACKGROUND_TRANSPARENT,
  BACKGROUND_CHECKERBOARD,
  '#ffffff',
  '#cccccc',
  '#999999',
  '#333333',
  '#a89a89',
  '#a9e4af',
  '#f1a8a4',
  '#64bbe2',
  '#8488b6'
]

export const DEFAULT_BACKGROUND_COLOR = BACKGROUND_TRANSPARENT

export const DEFAULT_IMAGE_SIZE = 100
