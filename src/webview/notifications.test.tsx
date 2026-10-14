/** @jest-environment jsdom */
import ReactDOM from 'react-dom'
import { act } from 'react-dom/test-utils'
import { message } from 'antd'
import { notifyActionResult } from './notifications'
import { webviewI18n } from '../i18n/react'

jest.mock('antd', () => ({ message: { error: jest.fn(), success: jest.fn() } }))

test('an already-visible toast follows the language without being recreated or losing technical details', async () => {
  const root = document.createElement('div'); document.body.appendChild(root)
  await webviewI18n.changeLanguage('en')
  try {
    notifyActionResult('EACCES: /project/photo.jpg')
    const node = (message.error as jest.Mock).mock.calls[0][0]
    act(() => { ReactDOM.render(node, root) })
    expect(root.textContent).toContain('Unable to complete the action')
    await act(async () => { await webviewI18n.changeLanguage('zh-TW') })
    expect(root.textContent).toContain('無法完成操作')
    expect(root.textContent).toContain('EACCES: /project/photo.jpg')
    expect(message.error).toHaveBeenCalledTimes(1)
  } finally { act(() => { ReactDOM.unmountComponentAtNode(root) }); root.remove() }
})
