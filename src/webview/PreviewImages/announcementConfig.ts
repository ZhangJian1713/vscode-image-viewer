import { resolveLanguage } from '../../i18n/language'

/**
 * Release notes: bump {@link ANNOUNCEMENT_ID} with `package.json` version and refresh copy per locale.
 * Users who have not dismissed this id see the modal once; dismiss persists in localStorage; bar entry reopens it.
 *
 * The bar and modal receive the same resolved application language. Missing or
 * unsupported locales use English; the browser/OS locale never overrides VS Code.
 */

/** Sync with `package.json` version; bumping re-shows the auto modal for users who had dismissed the old id. */
export const ANNOUNCEMENT_ID = '2.2.0'

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
      kind: 'feature',
      text: 'Choose Follow VS Code, English, 简体中文, or 繁體中文 in Settings → General → Language. All open gallery and single-image panels update immediately while preserving browsing and preview state.'
    },
    {
      kind: 'improvement',
      text: 'Reveal in Image folders selects and centers a search result’s containing folder, temporarily clears image search, and highlights the original image among its neighbors. Restore filters recovers the saved search.'
    },
    {
      kind: 'bugfix',
      text: 'Fixed galleries staying on “Scanning…” in code-server and other HTTP(S) WebViews by correcting host messaging initialization.'
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
      kind: 'feature',
      text: '在“设置 → 常规 → 语言”中选择跟随 VS Code、English、简体中文或繁體中文。所有已打开的图库和单图面板立即切换语言，并保留浏览与预览状态。'
    },
    {
      kind: 'improvement',
      text: '“在图片文件夹中显示”会展开、选中并居中搜索结果所在目录，临时清空图片搜索，在相邻图片中定位并高亮原图。可通过“恢复筛选”找回原搜索。'
    },
    {
      kind: 'bugfix',
      text: '修复 code-server 等 HTTP(S) WebView 环境下，图库因宿主消息初始化失败而一直停留在“正在扫描…”的问题。'
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
      kind: 'feature',
      text: '在「設定 → 一般 → 語言」中選擇跟隨 VS Code、English、简体中文或繁體中文。所有已開啟的圖庫與單圖面板立即切換語言，並保留瀏覽與預覽狀態。'
    },
    {
      kind: 'improvement',
      text: '「在圖片資料夾中顯示」會展開、選取並置中搜尋結果所在資料夾，暫時清空圖片搜尋，在相鄰圖片中定位並標示原圖。可透過「還原篩選」找回原搜尋。'
    },
    {
      kind: 'bugfix',
      text: '修正 code-server 等 HTTP(S) WebView 環境中，圖庫因主程式訊息初始化失敗而一直停留在「正在掃描…」的問題。'
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
