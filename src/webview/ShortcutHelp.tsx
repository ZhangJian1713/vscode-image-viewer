import React, { useLayoutEffect, useRef } from 'react'
import { getPreviewShortcutHelp } from 'right-image-preview'
import type { PreviewShortcutAction, PreviewShortcutCapabilities } from 'right-image-preview'
import { useI18n } from '../i18n/react'
import type { TranslationKey } from '../i18n/en'

const labels: Record<PreviewShortcutAction, TranslationKey> = {
  previous: 'shortcuts.previous', next: 'shortcuts.next', first: 'shortcuts.first', last: 'shortcuts.last',
  previousGroup: 'shortcuts.previousGroup', nextGroup: 'shortcuts.nextGroup', zoomIn: 'shortcuts.zoomIn',
  zoomOut: 'shortcuts.zoomOut', fit: 'shortcuts.fit', actualSize: 'shortcuts.actualSize', cycleZoom: 'shortcuts.cycleZoom',
  rotateCW: 'shortcuts.rotateCW', rotateCCW: 'shortcuts.rotateCCW', pan: 'shortcuts.pan', fullscreen: 'preview.toggleWindowFullscreen',
  shortcuts: 'shortcuts.open', exif: 'shortcuts.exif', delete: 'shortcuts.delete', close: 'shortcuts.closePreview'
}

export function ShortcutHelp({ capabilities, onClose }: { capabilities: PreviewShortcutCapabilities; onClose: () => void }) {
  const { t } = useI18n()
  const close = useRef<HTMLButtonElement>(null)
  useLayoutEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    close.current?.focus()
    return () => { if (previous?.isConnected) { previous.focus({ preventScroll: true }) } }
  }, [])
  const entries = getPreviewShortcutHelp(capabilities)
  return <div role='presentation'
    onMouseDown={(event) => { if (event.target === event.currentTarget) { onClose() } }}
    style={{ position: 'fixed', inset: 0, zIndex: 21000, padding: 20, display: 'grid', placeItems: 'center', background: 'rgba(0,0,0,.65)' }}>
    <section role='dialog' aria-modal='true' aria-label={t('shortcuts.title')}
      onKeyDownCapture={(event) => {
        event.stopPropagation()
        if (event.key === 'Escape' || (event.key === '?' && !event.ctrlKey && !event.metaKey && !event.altKey)) {
          event.preventDefault(); onClose()
        } else if (event.key === 'Tab') { event.preventDefault(); close.current?.focus() }
      }}
      style={{ width: 'min(720px, 100%)', maxHeight: '80vh', overflow: 'auto', borderRadius: 10,
        color: 'var(--vscode-editor-foreground, #ddd)', background: 'var(--vscode-editor-background, #222)',
        border: '1px solid var(--vscode-widget-border, #555)', boxShadow: '0 16px 60px #0008' }}>
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px' }}>
        <h2 style={{ margin: 0, fontSize: 18 }}>{t('shortcuts.title')}</h2>
        <button ref={close} type='button' onClick={onClose} aria-label={t('common.close')}
          style={{ border: 0, color: 'inherit', background: 'transparent', fontSize: 24, cursor: 'pointer' }}>×</button>
      </header>
      <div style={{ padding: '0 20px 20px' }}>
        <p>{t('shortcuts.note')}</p>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead><tr><th style={{ textAlign: 'left', padding: 8 }}>{t('shortcuts.action')}</th>
            <th style={{ textAlign: 'left', padding: 8 }}>{t('shortcuts.keys')}</th></tr></thead>
          <tbody>{entries.map((entry) => <tr key={entry.action}>
            <td style={{ padding: 8, borderTop: '1px solid var(--vscode-widget-border, #555)', width: '42%' }}>{t(labels[entry.action])}</td>
            <td style={{ padding: 8, borderTop: '1px solid var(--vscode-widget-border, #555)' }}>{entry.keys.map((key, index) => <React.Fragment key={key}>
              {index > 0 && ' / '}<kbd style={{ whiteSpace: 'nowrap' }}>{key}</kbd>
            </React.Fragment>)}</td>
          </tr>)}</tbody>
        </table>
        <p>{t('shortcuts.panNote')}</p>
        <p>{t('shortcuts.escapeNote')}</p>
      </div>
    </section>
  </div>
}
