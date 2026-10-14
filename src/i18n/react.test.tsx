/** @jest-environment jsdom */
import React, { useEffect, useState } from 'react'
import ReactDOM from 'react-dom'
import { act } from 'react-dom/test-utils'
import { MESSAGE_CMD } from '../constants'
import { LanguageProvider, useI18n, useLanguage, webviewI18n } from './react'
import type { LanguageSnapshot } from './language'

let root: HTMLDivElement
let snapshot: LanguageSnapshot
let bootstrap: (_result: any) => void
let save: (_result: any) => void
const transport = jest.fn((request, callback) => {
  if (request.cmd === MESSAGE_CMD.GET_UI_LANGUAGE) { bootstrap = callback }
  if (request.cmd === MESSAGE_CMD.SET_UI_LANGUAGE) { save = callback }
})
const mounted = jest.fn()
const unmounted = jest.fn()

function Harness() {
  const { t } = useI18n()
  const language = useLanguage()
  const [draft, setDraft] = useState('unsaved filter')
  useEffect(() => { mounted(); return () => { unmounted() } }, [])
  return <div>
    <input value={draft} onChange={(event) => setDraft(event.target.value)} />
    <span>{t('language.label')}</span>
    <button onClick={() => language.setPreference('zh-TW')}>choose</button>
    {language.saveError && <p role='alert'>{t('language.saveFailed')}</p>}
  </div>
}

beforeEach(async () => {
  jest.clearAllMocks()
  await webviewI18n.changeLanguage('en')
  snapshot = { language: 'en', preference: 'auto', revision: 0 }
  root = document.createElement('div'); document.body.appendChild(root)
  act(() => { ReactDOM.render(<LanguageProvider transport={transport}><Harness /></LanguageProvider>, root) })
})
afterEach(() => { act(() => { ReactDOM.unmountComponentAtNode(root) }); root.remove() })

function broadcast(value: LanguageSnapshot) {
  act(() => { window.dispatchEvent(new MessageEvent('message', { data: { cmd: MESSAGE_CMD.UI_LANGUAGE_CHANGED, data: value } })) })
}

test('bootstrap mounts business state once; later broadcasts only change presentation', () => {
  expect(root.textContent).toBe('')
  expect(mounted).not.toHaveBeenCalled()
  act(() => { bootstrap({ ok: true, snapshot }) })
  const input = root.querySelector('input')!
  input.focus(); input.setSelectionRange(3, 7)
  broadcast({ language: 'zh-CN', preference: 'zh-CN', revision: 1 })
  expect(root.textContent).toContain('语言')
  expect(document.documentElement.lang).toBe('zh-CN')
  expect(root.querySelector('input')).toBe(input)
  expect(input.value).toBe('unsaved filter')
  expect([input.selectionStart, input.selectionEnd]).toEqual([3, 7])
  expect(document.activeElement).toBe(input)
  broadcast({ language: 'zh-TW', preference: 'zh-TW', revision: 2 })
  expect(root.textContent).toContain('語言')
  expect(mounted).toHaveBeenCalledTimes(1)
  expect(unmounted).not.toHaveBeenCalled()
  expect(transport.mock.calls.filter(([request]) => request.cmd === MESSAGE_CMD.GET_UI_LANGUAGE)).toHaveLength(1)
})

test('a delayed bootstrap cannot override a newer language broadcast', () => {
  broadcast({ language: 'zh-TW', preference: 'zh-TW', revision: 5 })
  act(() => { bootstrap({ ok: true, snapshot }) })
  expect(root.textContent).toContain('語言')
  expect(document.documentElement.lang).toBe('zh-TW')
  expect(mounted).toHaveBeenCalledTimes(1)
})

test('failed persistence leaves the current language and draft intact; success changes language in place', () => {
  act(() => { bootstrap({ ok: true, snapshot }) })
  const input = root.querySelector('input')!
  act(() => { root.querySelector('button')!.click() })
  expect(transport).toHaveBeenLastCalledWith({ cmd: MESSAGE_CMD.SET_UI_LANGUAGE, data: { preference: 'zh-TW' } }, expect.any(Function))
  act(() => { save({ ok: false, snapshot }) })
  expect(root.querySelector('[role="alert"]')?.textContent).toContain('Unable to save')
  expect(webviewI18n.language).toBe('en')
  act(() => { root.querySelector('button')!.click() })
  act(() => { save({ ok: true, snapshot: { language: 'zh-TW', preference: 'zh-TW', revision: 1 } }) })
  expect(root.querySelector('[role="alert"]')).toBeNull()
  expect(root.textContent).toContain('語言')
  expect(root.querySelector('input')).toBe(input)
  expect(mounted).toHaveBeenCalledTimes(1)
})
