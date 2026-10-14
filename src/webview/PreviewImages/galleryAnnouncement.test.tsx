/** @jest-environment jsdom */
import React from 'react'
import ReactDOM from 'react-dom'
import { act } from 'react-dom/test-utils'
import { AnnouncementBar } from './AnnouncementBar'
import { ANNOUNCEMENT_DISMISS_STORAGE_KEY, ANNOUNCEMENT_ID, getAnnouncementStrings } from './announcementConfig'

jest.mock('./galleryBridge', () => ({ callGalleryHost: jest.fn() }))
jest.mock('@ant-design/icons', () => ({
  BulbOutlined: () => null,
  GithubOutlined: () => null,
  StarOutlined: () => null,
  ExportOutlined: () => null
}))
jest.mock('antd', () => {
  const React = require('react')
  return {
    Button: ({
      children,
      onClick,
      'aria-label': label
    }: {
      children?: React.ReactNode
      onClick?: () => void
      'aria-label'?: string
    }) => React.createElement('button', { onClick, 'aria-label': label }, children),
    Space: ({ children }: { children?: React.ReactNode }) => React.createElement('div', null, children),
    Modal: ({
      open,
      title,
      children,
      footer
    }: {
      open: boolean
      title: string
      children?: React.ReactNode
      footer?: React.ReactNode
    }) => (open ? React.createElement('div', { role: 'dialog' }, title, children, footer) : null)
  }
})

let root: HTMLDivElement
beforeEach(() => {
  localStorage.clear()
  root = document.createElement('div')
  document.body.appendChild(root)
})
afterEach(() => {
  act(() => {
    ReactDOM.unmountComponentAtNode(root)
  })
  root.remove()
})

function render(language: string) {
  act(() => {
    ReactDOM.render(<AnnouncementBar hostUiLanguage={language} />, root)
  })
}

test.each(['en', 'zh-CN', 'zh-TW'])(
  'renders classified updates and the settings feedback invitation for %s',
  (language) => {
    render(language)
    const copy = getAnnouncementStrings(language)
    const dialog = root.querySelector('[role="dialog"]')!
    const items = dialog.querySelectorAll('li')
    expect(items).toHaveLength(copy.updates.length)
    expect(items).toHaveLength(3)
    expect(items[0].textContent).toMatch(/language|语言|語言/i)
    expect(new Set(copy.updates.map((item) => item.kind))).toEqual(
      new Set(['feature', 'improvement', 'bugfix'])
    )
    copy.updates.forEach((item, index) => {
      expect(items[index].querySelector('strong')!.textContent).toBe(copy.categoryLabels[item.kind])
      expect(items[index].textContent).toContain(item.text)
    })
    expect(dialog.querySelector('.iv-announcement-feedback')!.textContent).toContain('Settings → Feedback')
  }
)

test.each([null, '2.0.6', '2.1.0', '2.1.1'])(
  'shows the same 2.2.0 announcement with dismissal state %s, saves dismissal, and allows manual reopening',
  (dismissedVersion) => {
    expect(ANNOUNCEMENT_ID).toBe(require('../../../package.json').version)
    if (dismissedVersion) { localStorage.setItem(ANNOUNCEMENT_DISMISS_STORAGE_KEY, dismissedVersion) }
    render('zh-CN')
    const dialog = root.querySelector('[role="dialog"]')!
    expect(dialog.textContent).toContain('v2.2.0')
    const copy = getAnnouncementStrings('zh-CN')
    expect(Array.from(dialog.querySelectorAll('li')).map((item) => item.textContent))
      .toEqual(copy.updates.map((item) => copy.categoryLabels[item.kind] + item.text))
    act(() => {
      dialog.querySelector('button')!.click()
    })
    expect(localStorage.getItem(ANNOUNCEMENT_DISMISS_STORAGE_KEY)).toBe(ANNOUNCEMENT_ID)
    expect(root.querySelector('[role="dialog"]')).toBeNull()
    act(() => {
      root.querySelector<HTMLButtonElement>(`button[aria-label="${copy.openReleaseNotesAria}"]`)!.click()
    })
    expect(root.querySelector('[role="dialog"]')).not.toBeNull()
  }
)

test('does not automatically reopen a dismissed current release and honors the host language', () => {
  localStorage.setItem(ANNOUNCEMENT_DISMISS_STORAGE_KEY, ANNOUNCEMENT_ID)
  render('en')
  expect(root.querySelector('[role="dialog"]')).toBeNull()
  act(() => {
    root.querySelector<HTMLButtonElement>('button[aria-label="Open release notes"]')!.click()
  })
  expect(root.querySelector('[role="dialog"]')!.textContent).toContain('What’s new in Image Viewer')
  render('zh-TW')
  expect(root.querySelector('[role="dialog"]')!.textContent).toContain('更新說明')
})
