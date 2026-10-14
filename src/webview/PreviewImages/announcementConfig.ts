/**
 * Release notes: bump {@link ANNOUNCEMENT_ID} with `package.json` version and refresh copy per locale.
 * Users who have not dismissed this id see the modal once; dismiss persists in localStorage; bar entry reopens it.
 *
 * Locale: the top bar is always English (`getAnnouncementBarTopStrings`). Modal copy uses
 * `getAnnouncementStrings(hostUiLanguage)`; when the host sends a non-empty `vscode.env.language`, **only that**
 * selects en / zh-Hans / zh-Hant (do not OR with `navigator.language`, or English UI + zh OS yields Chinese).
 * If missing, fall back to `navigator`.
 */

/** Sync with `package.json` version; bumping re-shows the auto modal for users who had dismissed the old id. */
export const ANNOUNCEMENT_ID = '2.0.6'

export const REPOSITORY_URL = 'https://github.com/ZhangJian1713/vscode-image-viewer'

export const ISSUES_URL = `${REPOSITORY_URL}/issues`

export const ANNOUNCEMENT_DISMISS_STORAGE_KEY = 'iv-image-viewer-announcement-dismissed-id'

function normalizeLangTag(raw: string): string {
  return raw.trim().toLowerCase().replace(/_/g, '-')
}

/** Webview `navigator` locale tags only (when the host does not inject a language). */
function collectNavigatorLocaleTags(): string[] {
  const tags: string[] = []
  if (typeof navigator !== 'undefined') {
    tags.push(normalizeLangTag(navigator.language))
    for (const l of navigator.languages ?? []) {
      tags.push(normalizeLangTag(l))
    }
  }
  return tags.filter((t) => t.length > 0)
}

function isChineseLocale(tags: string[]): boolean {
  return tags.some((t) => t === 'zh' || t.startsWith('zh-'))
}

function isTraditionalChineseLocale(tags: string[]): boolean {
  return tags.some(
    (t) =>
      t.startsWith('zh-tw') ||
      t.startsWith('zh-hk') ||
      t.startsWith('zh-mo') ||
      t === 'zh-hant' ||
      (t.startsWith('zh-') && t.includes('hant'))
  )
}

export type AnnouncementStrings = {
  modalTitle: string
  features: readonly string[]
  barCta: string
  barHint: string
  closeButton: string
  openReleaseNotesAria: string
}

const ANNOUNCEMENT_COPY_EN: AnnouncementStrings = {
  modalTitle: `What’s new in Image Viewer v${ANNOUNCEMENT_ID}`,
  features: [
    'Folders sidebar with image counts, directory search, collapsible branches, and folder context menus.',
    'One continuous image wall with Fill, Grid, List, and compact layouts.',
    'Virtual scrolling and bounded thumbnail requests for large collections; older disk thumbnails are cleaned automatically.',
    'Open individual images in a read-only editor with zoom, pan, rotate, flip, minimap, and same-folder navigation.',
    'Use the optional commands to set Image Viewer as the default image editor or restore the built-in editor.',
    'Gallery image deletion now moves files to system Trash after confirmation.'
  ],
  barCta: 'What’s new',
  barHint: '— click for details',
  closeButton: 'Close',
  openReleaseNotesAria: 'Open release notes'
}

const ANNOUNCEMENT_COPY_ZH_HANS: AnnouncementStrings = {
  modalTitle: `Image Viewer v${ANNOUNCEMENT_ID} 更新说明`,
  features: [
    '新增 Folders 侧栏：图片计数、目录搜索、展开与折叠，以及文件夹右键菜单。',
    '连续图片墙支持 Fill、Grid、List 和紧凑模式。',
    '目录树与图片墙采用虚拟滚动，缩略图请求有并发和缓存预算，旧磁盘缩略图自动清理。',
    '单张图片可在只读编辑器中缩放、拖动、旋转、翻转，并使用小地图和同目录切换。',
    '可通过命令设为默认图片编辑器，或恢复内置编辑器；安装不会自动修改关联。',
    '图库删除图片时先确认，再移入系统回收站。'
  ],
  barCta: '更新说明',
  barHint: '— 点击查看详情',
  closeButton: '关闭',
  openReleaseNotesAria: '打开更新说明'
}

const ANNOUNCEMENT_COPY_ZH_HANT: AnnouncementStrings = {
  modalTitle: `Image Viewer v${ANNOUNCEMENT_ID} 更新說明`,
  features: [
    '新增 Folders 側欄：圖片計數、目錄搜尋、展開與摺疊，以及資料夾右鍵選單。',
    '連續圖片牆支援 Fill、Grid、List 和緊湊模式。',
    '目錄樹與圖片牆採用虛擬捲動，縮圖請求有並行和快取預算，舊磁碟縮圖自動清理。',
    '單張圖片可在唯讀編輯器中縮放、拖曳、旋轉、翻轉，並使用小地圖和同目錄切換。',
    '可透過命令設為預設圖片編輯器，或恢復內建編輯器；安裝不會自動修改關聯。',
    '圖庫刪除圖片時先確認，再移入系統資源回收筒。'
  ],
  barCta: '更新說明',
  barHint: '— 點擊檢視詳情',
  closeButton: '關閉',
  openReleaseNotesAria: '開啟更新說明'
}

/**
 * @param hostUiLanguage Host `vscode.env.language` via `GET_CONFIG.hostUiLanguage`. When set, modal locale follows **only** this, not the browser OS locale.
 */
export function getAnnouncementStrings(hostUiLanguage?: string | null): AnnouncementStrings {
  const trimmed = typeof hostUiLanguage === 'string' ? hostUiLanguage.trim() : ''
  if (trimmed !== '') {
    const host = normalizeLangTag(trimmed)
    if (!(host === 'zh' || host.startsWith('zh-'))) {
      return ANNOUNCEMENT_COPY_EN
    }
    return isTraditionalChineseLocale([host]) ? ANNOUNCEMENT_COPY_ZH_HANT : ANNOUNCEMENT_COPY_ZH_HANS
  }
  const tags = collectNavigatorLocaleTags()
  if (!isChineseLocale(tags)) {
    return ANNOUNCEMENT_COPY_EN
  }
  return isTraditionalChineseLocale(tags) ? ANNOUNCEMENT_COPY_ZH_HANT : ANNOUNCEMENT_COPY_ZH_HANS
}

export type AnnouncementBarTopStrings = Pick<AnnouncementStrings, 'barCta' | 'barHint' | 'openReleaseNotesAria'>

/** Top bar strings are always English; modal copy is {@link getAnnouncementStrings}. */
export function getAnnouncementBarTopStrings(): AnnouncementBarTopStrings {
  return {
    barCta: ANNOUNCEMENT_COPY_EN.barCta,
    barHint: ANNOUNCEMENT_COPY_EN.barHint,
    openReleaseNotesAria: ANNOUNCEMENT_COPY_EN.openReleaseNotesAria
  }
}
