import type { TranslationKey } from '../../i18n/en'
import type { Translate } from '../../i18n/translator'

/** Sync with package.json on release; a new id reopens the dismissed announcement. */
export const ANNOUNCEMENT_ID = '2.3.0'

export { REPOSITORY_URL, ISSUES_URL } from '../../feedback'

export const ANNOUNCEMENT_DISMISS_STORAGE_KEY = 'iv-image-viewer-announcement-dismissed-id'

export type AnnouncementKind = 'feature' | 'improvement' | 'bugfix' | 'compatibility'
export type AnnouncementItem = { kind: AnnouncementKind; text: string }
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

// Only the current release is selected; all copy uses the shared i18n catalogs.
const updates: ReadonlyArray<{ kind: AnnouncementKind; message: TranslationKey }> = [
  { kind: 'feature', message: 'announcement.current.feature.filmstrip' },
  { kind: 'feature', message: 'announcement.current.feature.shortcuts' },
  { kind: 'feature', message: 'announcement.current.feature.groups' },
  { kind: 'improvement', message: 'announcement.current.improvement.zoom' },
  { kind: 'improvement', message: 'announcement.current.improvement.refresh' },
  { kind: 'improvement', message: 'announcement.current.improvement.preload' },
  { kind: 'improvement', message: 'announcement.current.improvement.appearance' },
  { kind: 'bugfix', message: 'announcement.current.bugfix.navigation' },
  { kind: 'bugfix', message: 'announcement.current.bugfix.security' }
]

/** Use the caller's existing translator so the bar and open dialog change language together. */
export function getAnnouncementStrings(t: Translate): AnnouncementStrings {
  const version = { version: ANNOUNCEMENT_ID }
  return {
    modalTitle: t('announcement.title', version),
    updates: updates.map(({ kind, message }) => ({ kind, text: t(message) })),
    categoryLabels: {
      feature: t('announcement.category.feature'),
      improvement: t('announcement.category.improvement'),
      bugfix: t('announcement.category.bugfix'),
      compatibility: t('announcement.category.compatibility')
    },
    feedbackInvitation: t('announcement.feedback', version),
    barCta: t('announcement.barCta'),
    barHint: t('announcement.barHint'),
    closeButton: t('common.close'),
    openReleaseNotesAria: t('announcement.open')
  }
}
