import { resolveLanguage } from '../../i18n/language'

/**
 * Release notes: bump {@link ANNOUNCEMENT_ID} with `package.json` version and refresh copy per locale.
 * Users who have not dismissed this id see the modal once; dismiss persists in localStorage; bar entry reopens it.
 *
 * The bar and modal receive the same resolved application language. Missing or
 * unsupported locales use English; the browser/OS locale never overrides VS Code.
 */

/** Sync with `package.json` version; bumping re-shows the auto modal for users who had dismissed the old id. */
export const ANNOUNCEMENT_ID = '2.0.6'

export { REPOSITORY_URL, ISSUES_URL } from '../../feedback'

export const ANNOUNCEMENT_DISMISS_STORAGE_KEY = 'iv-image-viewer-announcement-dismissed-id'

export type AnnouncementKind = 'feature' | 'improvement' | 'bugfix' | 'compatibility'

export type AnnouncementItem = {
  kind: AnnouncementKind
  text: string
}

export type AnnouncementStrings = {
  modalTitle: string
  updates: readonly AnnouncementItem[]
  categoryLabels: Record<AnnouncementKind, string>
  feedbackInvitation: string
  barCta: string
  barHint: string
  closeButton: string
  openReleaseNotesAria: string
}

const ANNOUNCEMENT_COPY_EN: AnnouncementStrings = {
  modalTitle: `What’s new in Image Viewer v${ANNOUNCEMENT_ID}`,
  categoryLabels: {
    feature: 'Feature',
    improvement: 'Improvement',
    bugfix: 'Bugfix',
    compatibility: 'Compatibility'
  },
  updates: [
    {
      kind: 'bugfix',
      text: 'Fixed security issues involving command execution, file access, and external links, and strengthened configuration validation and script loading restrictions.'
    },
    {
      kind: 'feature',
      text: 'A continuous image wall with Grid, Fill, and List layouts, compact mode, and adjustable thumbnail sizes with 1–20 columns in Fill/Grid.'
    },
    {
      kind: 'feature',
      text: 'Image folders sidebar with image counts, folder search, collapsible branches, resizing, and folder context menus. Include/Exclude rules support project-relative paths and Glob patterns, alongside folder and image searches.'
    },
    {
      kind: 'feature',
      text: 'Sort within folders by name, modified time, size, or format, or sort all images globally. Folder-first is the default; dragging the scrollbar shows visible folders and centers their highlights in the tree.'
    },
    {
      kind: 'feature',
      text: 'Open individual images in a dedicated editor with zoom, pan, rotation, flip, minimap, and same-folder navigation. Use “Image Viewer: Use as Default Image Editor” to make it your default; installation does not change associations automatically.'
    },
    {
      kind: 'feature',
      text: 'Bottom-right Settings provides file-size display preferences and a Feedback tab with GitHub issue and email entry points.'
    },
    {
      kind: 'improvement',
      text: 'Explorer entries in the same project reuse one gallery. Folder and ordinary-file entries locate their directory; image entries highlight the thumbnail and open preview. Empty folders fall back to the nearest ancestor with images.'
    },
    {
      kind: 'improvement',
      text: 'Space and a primary-mouse click cycle through two or three zoom levels suited to the image. Zoom presets now reach 800% in both the gallery preview and image editor.'
    },
    {
      kind: 'improvement',
      text: 'Rebuilt gallery scrolling for large collections: load visible thumbnails first, generate up to four concurrently, and automatically clean older disk thumbnails when cache limits are reached.'
    },
    {
      kind: 'improvement',
      text: 'Follow inherits your VS Code/Cursor theme and custom colors; Light and Dark offer fixed palettes. Choose a frameless thumbnail background, and enjoy a subtle hover zoom. Deleting gallery images now moves them to system Trash after confirmation.'
    },
    { kind: 'bugfix', text: 'Very large one-column collections can now scroll all the way to their final images.' },
    { kind: 'bugfix', text: 'Image selection now matches Windows paths consistently even when slash styles differ.' },
    {
      kind: 'compatibility',
      text: 'Requires VS Code 1.92+ or a compatible Cursor version; macOS requires 11+. Platform-specific packages include their thumbnail runtime, so no separate Node.js installation is needed.'
    }
  ],
  feedbackInvitation:
    `How does v${ANNOUNCEMENT_ID} feel to use? We welcome your experience, bug reports, and ideas. Open the bottom-right gear → Settings → Feedback to create a GitHub issue or open your email app.`,
  barCta: 'What’s new',
  barHint: '— click for details',
  closeButton: 'Close',
  openReleaseNotesAria: 'Open release notes'
}

const ANNOUNCEMENT_COPY_ZH_HANS: AnnouncementStrings = {
  modalTitle: `Image Viewer v${ANNOUNCEMENT_ID} 更新说明`,
  categoryLabels: {
    feature: 'Feature · 新功能',
    improvement: 'Improvement · 改进',
    bugfix: 'Bugfix · 修复',
    compatibility: 'Compatibility · 兼容要求'
  },
  updates: [
    {
      kind: 'bugfix',
      text: '修复了命令执行、文件访问及外链处理中的安全问题，并加强了配置校验和脚本加载限制。'
    },
    {
      kind: 'feature',
      text: '连续图片墙支持 Grid、Fill、List 三种布局和 Compact 紧凑模式；可调整缩略图大小，Fill/Grid 支持 1～20 列。'
    },
    {
      kind: 'feature',
      text: 'Image folders 侧栏显示图片数量，支持文件夹搜索、展开折叠、调整宽度和右键菜单。Include/Exclude 支持项目相对路径与 Glob 通配符规则，可与文件夹搜索、图片搜索一起使用。'
    },
    {
      kind: 'feature',
      text: '支持按文件夹分组，再在组内按名称、修改时间、大小或格式排序，也可切换为全局排序。默认文件夹优先；拖动滚动条时显示当前可见图片的文件夹，并在目录树中居中高亮。'
    },
    {
      kind: 'feature',
      text: '单张图片可在独立编辑器中缩放、拖动、旋转、翻转，使用小地图并切换同目录图片。运行“Image Viewer: Use as Default Image Editor”可设为默认查看器；安装不会自动修改关联。'
    },
    { kind: 'feature', text: '右下角 Settings 提供文件大小显示设置；Feedback 页签提供 GitHub Issue 和邮件反馈入口。' },
    {
      kind: 'improvement',
      text: '同一项目的 Explorer 入口复用一个图库。文件夹与普通文件定位到对应目录；图片会高亮缩略图并打开预览。无图片目录逐级回退到最近有图片资源的祖先。'
    },
    {
      kind: 'improvement',
      text: '空格和单击鼠标左键可循环切换适合当前图片的两到三个缩放档位；图库预览和单图编辑器的缩放预设最高达到 800%。'
    },
    {
      kind: 'improvement',
      text: '重做大图库滚动：优先加载视口中的缩略图，后台最多并发生成 4 张，磁盘缓存达到限制后自动清理较旧的缩略图。'
    },
    {
      kind: 'improvement',
      text: 'Follow 继承当前 VS Code/Cursor 的主题与自定义配色，Light/Dark 提供固定配色；缩略图支持无边界背景和轻微悬停缩放。图库删除图片经确认后移入系统回收站。'
    },
    { kind: 'bugfix', text: '修复超大型单列图片墙无法滚动到最后几张图片的问题。' },
    { kind: 'bugfix', text: '修复 Windows 路径使用不同斜杠时，图片选中状态匹配不一致的问题。' },
    {
      kind: 'compatibility',
      text: '需要 VS Code 1.92+ 或兼容的 Cursor 版本，macOS 需要 11+。各平台安装包已包含缩略图运行组件，无需另装 Node.js。'
    }
  ],
  feedbackInvitation:
    `欢迎分享 v${ANNOUNCEMENT_ID} 的使用体验、遇到的问题和改进建议。点击右下角齿轮 → Settings → Feedback，即可创建 GitHub Issue，或打开邮件应用发送反馈。`,
  barCta: '更新说明',
  barHint: '— 点击查看详情',
  closeButton: '关闭',
  openReleaseNotesAria: '打开更新说明'
}

const ANNOUNCEMENT_COPY_ZH_HANT: AnnouncementStrings = {
  modalTitle: `Image Viewer v${ANNOUNCEMENT_ID} 更新說明`,
  categoryLabels: {
    feature: 'Feature · 新功能',
    improvement: 'Improvement · 改善',
    bugfix: 'Bugfix · 修正',
    compatibility: 'Compatibility · 相容要求'
  },
  updates: [
    {
      kind: 'bugfix',
      text: '修正了命令執行、檔案存取及外部連結處理中的安全問題，並加強了設定驗證和指令碼載入限制。'
    },
    {
      kind: 'feature',
      text: '連續圖片牆支援 Grid、Fill、List 三種版面與 Compact 緊湊模式；可調整縮圖大小，Fill/Grid 支援 1～20 欄。'
    },
    {
      kind: 'feature',
      text: 'Image folders 側欄顯示圖片數量，支援資料夾搜尋、展開摺疊、調整寬度與右鍵選單。Include/Exclude 支援專案相對路徑與 Glob 萬用字元規則，可與資料夾搜尋、圖片搜尋一起使用。'
    },
    {
      kind: 'feature',
      text: '支援按資料夾分組，再於組內按名稱、修改時間、大小或格式排序，也可切換為全域排序。預設資料夾優先；拖曳捲軸時顯示目前可見圖片的資料夾，並在目錄樹中置中標示。'
    },
    {
      kind: 'feature',
      text: '單張圖片可在獨立編輯器中縮放、拖曳、旋轉、翻轉，使用小地圖並切換同目錄圖片。執行「Image Viewer: Use as Default Image Editor」可設為預設檢視器；安裝不會自動修改關聯。'
    },
    { kind: 'feature', text: '右下角 Settings 提供檔案大小顯示設定；Feedback 頁籤提供 GitHub Issue 與郵件回饋入口。' },
    {
      kind: 'improvement',
      text: '同一專案的 Explorer 入口共用一個圖庫。資料夾與一般檔案定位到對應目錄；圖片會標示縮圖並開啟預覽。無圖片目錄逐級回退到最近有圖片資源的上層目錄。'
    },
    {
      kind: 'improvement',
      text: '空白鍵與按一下滑鼠左鍵可循環切換適合目前圖片的兩到三個縮放級距；圖庫預覽與單圖編輯器的縮放預設最高達到 800%。'
    },
    {
      kind: 'improvement',
      text: '重做大型圖庫捲動：優先載入可視區域的縮圖，背景最多同時產生 4 張，磁碟快取達到限制後自動清理較舊的縮圖。'
    },
    {
      kind: 'improvement',
      text: 'Follow 繼承目前 VS Code/Cursor 的佈景主題與自訂配色，Light/Dark 提供固定配色；縮圖支援無邊界背景與輕微懸停縮放。圖庫刪除圖片經確認後移入系統資源回收筒。'
    },
    { kind: 'bugfix', text: '修正超大型單欄圖片牆無法捲動到最後幾張圖片的問題。' },
    { kind: 'bugfix', text: '修正 Windows 路徑使用不同斜線時，圖片選取狀態比對不一致的問題。' },
    {
      kind: 'compatibility',
      text: '需要 VS Code 1.92+ 或相容的 Cursor 版本，macOS 需要 11+。各平台安裝套件已包含縮圖執行元件，無需另裝 Node.js。'
    }
  ],
  feedbackInvitation:
    `歡迎分享 v${ANNOUNCEMENT_ID} 的使用體驗、遇到的問題與改善建議。點擊右下角齒輪 → Settings → Feedback，即可建立 GitHub Issue，或開啟郵件應用程式傳送回饋。`,
  barCta: '更新說明',
  barHint: '— 點擊檢視詳情',
  closeButton: '關閉',
  openReleaseNotesAria: '開啟更新說明'
}

/**
 * @param hostUiLanguage Resolved application language; an omitted value uses English.
 */
export function getAnnouncementStrings(hostUiLanguage?: string | null): AnnouncementStrings {
  const language = resolveLanguage(hostUiLanguage)
  return language === 'zh-CN' ? ANNOUNCEMENT_COPY_ZH_HANS : language === 'zh-TW' ? ANNOUNCEMENT_COPY_ZH_HANT : ANNOUNCEMENT_COPY_EN
}

export type AnnouncementBarTopStrings = Pick<AnnouncementStrings, 'barCta' | 'barHint' | 'openReleaseNotesAria'>

/** Share one language decision for the bar and its modal. */
export function getAnnouncementBarTopStrings(language?: string): AnnouncementBarTopStrings {
  const copy = getAnnouncementStrings(language || 'en')
  return { barCta: copy.barCta, barHint: copy.barHint, openReleaseNotesAria: copy.openReleaseNotesAria }
}
