/** @jest-environment jsdom */
import React from 'react'
import ReactDOM from 'react-dom'
import { act } from 'react-dom/test-utils'
import { HostImagePreview } from './HostImagePreview'
import { MESSAGE_CMD } from '../constants'
jest.mock('./HostImagePreview.css', () => ({}))
jest.mock('../i18n/react', () => ({ useI18n: () => ({ t: (key) => key, language: 'en' }) }))

let root: HTMLDivElement
beforeEach(() => {
  window.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} } as typeof ResizeObserver
  root = document.createElement('div'); document.body.appendChild(root)
})
afterEach(() => { act(() => { ReactDOM.unmountComponentAtNode(root) }); root.remove() })
const images = [{ id: 'a', src: 'test:a' }, { id: 'b', src: 'test:b' }]
const transport = jest.fn((message, callback) => {
  if (message.cmd === MESSAGE_CMD.GET_FILMSTRIP_STATE) { callback({ ok: true, visible: false }) }
  if (message.cmd === MESSAGE_CMD.GET_PREVIEW_PREFERENCES) { callback({ ok: true, snapshot: { showMirrorButtons: false, revision: 0 } }) }
})

test('mirror preference updates both preview scopes without replacing the main image; only clockwise rotation stays in the toolbar', () => {
  for (const scope of ['single', 'gallery'] as const) {
    act(() => { ReactDOM.render(<HostImagePreview key={scope} images={images} visible transport={transport} filmstripScope={scope}
      progressiveMain={false} preloadRadius={0} preloadDisplaySlots={0} />, root) })
    const main = root.querySelector('img[src="test:a"]')
    expect(root.querySelector('[aria-label="Flip horizontal"]')).toBeNull()
    expect(root.querySelector('[aria-label="Rotate 90° counter-clockwise"]')).toBeNull()
    expect(root.querySelector('[aria-label="Rotate 90° clockwise"]')).not.toBeNull()
    act(() => { window.dispatchEvent(new MessageEvent('message', { data: {
      cmd: MESSAGE_CMD.PREVIEW_PREFERENCES_CHANGED, data: { showMirrorButtons: true, revision: 2 }
    } })) })
    expect(root.querySelector('[aria-label="Flip horizontal"]')).not.toBeNull()
    expect(root.querySelector('[aria-label="Flip vertical"]')).not.toBeNull()
    expect(root.querySelector('img[src="test:a"]')).toBe(main)
    act(() => { window.dispatchEvent(new MessageEvent('message', { data: {
      cmd: MESSAGE_CMD.PREVIEW_PREFERENCES_CHANGED, data: { showMirrorButtons: false, revision: 1 }
    } })) })
    expect(root.querySelector('[aria-label="Flip horizontal"]')).not.toBeNull()
    act(() => { window.dispatchEvent(new MessageEvent('message', { data: {
      cmd: MESSAGE_CMD.PREVIEW_PREFERENCES_CHANGED, data: { showMirrorButtons: false, revision: 3 }
    } })) })
    expect(root.querySelector('[aria-label="Flip horizontal"]')).toBeNull()
  }
})
function press(target: Element, key: string, code: string) {
  act(() => { target.dispatchEvent(new KeyboardEvent('keydown', { key, code, shiftKey: key === '?', bubbles: true, cancelable: true })) })
}

test('help button and ? share a read-only reference; Esc closes help first and restores focus', () => {
  const close = jest.fn(), index = jest.fn()
  act(() => { ReactDOM.render(<HostImagePreview images={images} visible transport={transport} filmstripScope='single'
    progressiveMain={false} preloadRadius={0} preloadDisplaySlots={0} onClose={close} onIndexChange={index} />, root) })
  const main = root.querySelector('img[src="test:a"]')
  const button = root.querySelector<HTMLButtonElement>('[aria-label="shortcuts.open"]')!
  button.focus()
  act(() => { button.click() })
  let dialog = root.querySelector('[aria-label="shortcuts.title"]')!
  expect(dialog).not.toBeNull()
  expect(dialog.textContent).toContain('shortcuts.previous')
  expect(dialog.textContent).toContain('Shift + R')
  const panRows = Array.from(dialog.querySelectorAll('tbody tr')).filter((row) => row.textContent!.includes('shortcuts.pan'))
  expect(panRows.map((row) => Array.from(row.querySelectorAll('td')).map((cell) => cell.textContent))).toEqual([
    ['shortcuts.panUp', 'W / Numpad 8'], ['shortcuts.panDown', 'S / Numpad 2 / Numpad 5'],
    ['shortcuts.panLeft', 'A / Numpad 4'], ['shortcuts.panRight', 'D / Numpad 6'],
    ['shortcuts.panUpLeft', 'Numpad 7'], ['shortcuts.panUpRight', 'Numpad 9'],
    ['shortcuts.panDownLeft', 'Numpad 1'], ['shortcuts.panDownRight', 'Numpad 3']
  ])
  expect(dialog.textContent).not.toMatch(/(?:Ctrl\/⌘|Shift) \+ [↑↓←→]/)
  expect(dialog.textContent).not.toContain('shortcuts.delete')
  expect(dialog.textContent).not.toContain('shortcuts.exif')
  expect(dialog.textContent).not.toContain('shortcuts.previousGroup')
  const closeButton = dialog.querySelector('button')!
  expect(document.activeElement).toBe(closeButton)
  press(closeButton, 'Tab', 'Tab')
  const content = dialog.querySelector('[tabindex="0"]')!
  expect(document.activeElement).toBe(content)
  press(content, 'ArrowDown', 'ArrowDown')
  expect(index).not.toHaveBeenCalled()
  act(() => { content.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', code: 'Tab', shiftKey: true, bubbles: true, cancelable: true })) })
  expect(document.activeElement).toBe(closeButton)
  press(closeButton, 'ArrowRight', 'ArrowRight')
  expect(index).not.toHaveBeenCalled()
  press(closeButton, 'Escape', 'Escape')
  expect(root.querySelector('[aria-label="shortcuts.title"]')).toBeNull()
  expect(document.activeElement).toBe(button)
  expect(close).not.toHaveBeenCalled()
  expect(root.querySelector('img[src="test:a"]')).toBe(main)
  press(button, '?', 'Slash')
  dialog = root.querySelector('[aria-label="shortcuts.title"]')!
  expect(dialog).not.toBeNull()
  press(dialog.querySelector('button')!, '?', 'Slash')
  expect(root.querySelector('[aria-label="shortcuts.title"]')).toBeNull()
  expect(close).not.toHaveBeenCalled()
})

test('controlled selection also controls thumbnail request priority after external navigation', () => {
  const items = Array.from({ length: 50 }, (_, index) => ({ id: String(index), src: `test:controlled-${index}` }))
  const requests: Array<{ id: string; reply: (value: unknown) => void }> = []
  const controlledTransport = (message, callback) => {
    if (message.cmd === MESSAGE_CMD.GET_FILMSTRIP_STATE) { callback({ ok: true, visible: true }) }
    if (message.cmd === MESSAGE_CMD.GET_PREVIEW_PREFERENCES) { callback({ ok: true, snapshot: { showMirrorButtons: false, revision: 0 } }) }
    if (message.cmd === MESSAGE_CMD.GET_FILMSTRIP_THUMBNAIL) { requests.push({ id: message.data.id, reply: callback }) }
  }
  const show = (index: number) => act(() => { ReactDOM.render(<HostImagePreview images={items} index={index} visible
    filmstripScope='single' transport={controlledTransport} progressiveMain={false} preloadRadius={0} preloadDisplaySlots={0} />, root) })
  show(25)
  expect(requests[0].id).toBe('25')
  show(30)
  act(() => requests[0].reply({ kind: 'thumb', thumbSrc: 'cache:25' }))
  expect(requests[requests.length - 1].id).toBe('30')
})
