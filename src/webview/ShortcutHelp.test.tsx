/** @jest-environment jsdom */
import React from 'react'
import ReactDOM from 'react-dom'
import { act } from 'react-dom/test-utils'
import { HostImagePreview } from './HostImagePreview'
import { MESSAGE_CMD } from '../constants'
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
  expect(dialog.textContent).not.toContain('shortcuts.delete')
  expect(dialog.textContent).not.toContain('shortcuts.exif')
  expect(dialog.textContent).not.toContain('shortcuts.previousGroup')
  const closeButton = dialog.querySelector('button')!
  expect(document.activeElement).toBe(closeButton)
  press(closeButton, 'Tab', 'Tab')
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
