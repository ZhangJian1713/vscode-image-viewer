export const MIRROR_BUTTONS_SETTING = 'imageViewer.showMirrorButtons'
export interface PreviewPreferencesSnapshot { showMirrorButtons: boolean; revision: number }
export function isPreviewPreferencesSnapshot(value: unknown): value is PreviewPreferencesSnapshot {
  const snapshot = value as PreviewPreferencesSnapshot
  return !!snapshot && typeof snapshot.showMirrorButtons === 'boolean' &&
    Number.isSafeInteger(snapshot.revision) && snapshot.revision >= 0
}
