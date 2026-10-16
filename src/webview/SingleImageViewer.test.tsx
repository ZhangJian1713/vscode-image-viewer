/** @jest-environment jsdom */
import React from 'react'
import ReactDOM from 'react-dom'
import { act } from 'react-dom/test-utils'
import SingleImageViewer from './SingleImageViewer'
import { LanguageProvider, webviewI18n } from '../i18n/react'
import { MESSAGE_CMD } from '../constants'
import { useResourceCacheSlot } from './resourceCache/ResourceCacheBoundary'
jest.mock('./HostImagePreview.css', () => ({}))

let mockPreviewProps: any
jest.mock('right-image-preview', () => ({ ImagePreview: (props) => { mockPreviewProps = props; return <div /> } }))
jest.mock('@easy_vscode/webview', () => ({ callVscode: jest.fn() }))
jest.mock('./resourceCache/ResourceCacheBoundary', () => ({ useResourceCacheSlot: jest.fn() }))
const transport = (request, callback) => {
  if (request.cmd === MESSAGE_CMD.GET_UI_LANGUAGE) {
    callback({ ok: true, snapshot: { preference: 'auto', language: 'en', revision: 0 } })
  }
}

test('single-editor language broadcasts retain the sibling dataset and active resource slot', async () => {
  await webviewI18n.changeLanguage('en')
  const root = document.createElement('div'); document.body.appendChild(root)
  ;(window as any).commandArgs = [{ images: [
    { id: 'a', src: 'image:a', name: 'a.png' }, { id: 'b', src: 'image:b', name: 'b.png' },
    { id: 'c', src: 'image:c', name: 'c.png' }
  ], currentIndex: 1 }]
  try {
    act(() => { ReactDOM.render(<LanguageProvider transport={transport}><SingleImageViewer /></LanguageProvider>, root) })
    const images = mockPreviewProps.images
    expect(mockPreviewProps.groupedImages).toBeUndefined()
    expect(mockPreviewProps.defaultIndex).toBe(1)
    expect(mockPreviewProps.arrows).toBe('both')
    expect(mockPreviewProps.closeOnMaskClick).toBe(false)
    expect(mockPreviewProps.smallImageZoom).toEqual({ maxEdge: 64, maxNativePercent: 1600 })
    act(() => { mockPreviewProps.onIndexChange(2) })
    for (const [index, language] of ['zh-CN', 'zh-TW', 'en'].entries()) {
      act(() => { window.dispatchEvent(new MessageEvent('message', { data: {
        cmd: MESSAGE_CMD.UI_LANGUAGE_CHANGED, data: { preference: language, language, revision: index + 1 }
      } })) })
      expect(mockPreviewProps.language).toBe(language)
      expect(mockPreviewProps.images).toBe(images)
      expect(mockPreviewProps.groupedImages).toBeUndefined()
      expect(useResourceCacheSlot).toHaveBeenLastCalledWith('single-editor-main-image', 'image:c')
    }
  } finally {
    act(() => { ReactDOM.unmountComponentAtNode(root) }); root.remove(); delete (window as any).commandArgs
  }
})
