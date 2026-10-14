import { workspace } from 'vscode'
import { MESSAGE_CMD } from '../constants'
import { getLanguageSnapshot, languageRequest, registerLanguageService, trackLanguageWebview, updateLanguagePreference } from './languageHost'

let mockPreference: unknown = 'auto'
let mockLocale = 'en'
let mockConfigChanged: (event: { affectsConfiguration: (_key: string) => boolean }) => void
const mockUpdate = jest.fn(async (_key, value) => { mockPreference = value })
jest.mock('vscode', () => ({
  ConfigurationTarget: { Global: 1 },
  env: { get language() { return mockLocale } },
  workspace: {
    getConfiguration: jest.fn(() => ({ get: () => mockPreference, update: mockUpdate })),
    onDidChangeConfiguration: (callback) => { mockConfigChanged = callback; return { dispose() {} } }
  }
}), { virtual: true })

beforeEach(() => {
  mockPreference = 'auto'
  mockLocale = 'en'
  mockUpdate.mockClear()
  mockUpdate.mockImplementation(async (_key, value) => { mockPreference = value })
})

test('bootstrap and invalid stored preferences follow VS Code, including English fallback', () => {
  mockLocale = 'zh-Hant'
  expect(getLanguageSnapshot()).toMatchObject({ preference: 'auto', language: 'zh-TW' })
  mockPreference = 'unsupported'
  mockLocale = 'ja'
  expect(getLanguageSnapshot()).toMatchObject({ preference: 'auto', language: 'en' })
  mockPreference = 'zh-CN'
  expect(getLanguageSnapshot().language).toBe('zh-CN')
})

test('one user setting update reaches all live panels; disposed panels are released', async () => {
  registerLanguageService({ subscriptions: [] } as any)
  const one = { postMessage: jest.fn(async () => true) } as any
  const two = { postMessage: jest.fn(async () => true) } as any
  const first = trackLanguageWebview(one)
  const second = trackLanguageWebview(two)
  try {
    const reply = await languageRequest(MESSAGE_CMD.SET_UI_LANGUAGE, 'zh-TW')
    expect(mockUpdate).toHaveBeenCalledWith('language', 'zh-TW', 1)
    expect(reply).toMatchObject({ ok: true, snapshot: { preference: 'zh-TW', language: 'zh-TW' } })
    expect(one.postMessage).toHaveBeenLastCalledWith({ cmd: MESSAGE_CMD.UI_LANGUAGE_CHANGED, data: reply.snapshot })
    expect(two.postMessage).toHaveBeenLastCalledWith({ cmd: MESSAGE_CMD.UI_LANGUAGE_CHANGED, data: reply.snapshot })
    second.dispose()
    two.postMessage.mockClear()
    mockPreference = 'auto'
    mockLocale = 'zh-CN'
    mockConfigChanged({ affectsConfiguration: (key) => key === 'imageViewer.language' })
    expect(one.postMessage.mock.calls.pop()[0].data).toMatchObject({ language: 'zh-CN', preference: 'auto' })
    expect(two.postMessage).not.toHaveBeenCalled()
  } finally { first.dispose(); second.dispose() }
})

test('failed or invalid writes retain the previous preference and do not broadcast', async () => {
  mockPreference = 'zh-CN'
  const webview = { postMessage: jest.fn() } as any
  const subscription = trackLanguageWebview(webview)
  try {
    mockUpdate.mockRejectedValueOnce(new Error('unwritable settings'))
    expect(await languageRequest(MESSAGE_CMD.SET_UI_LANGUAGE, 'zh-TW'))
      .toMatchObject({ ok: false, snapshot: { preference: 'zh-CN', language: 'zh-CN' } })
    expect(await languageRequest(MESSAGE_CMD.SET_UI_LANGUAGE, '__proto__')).toMatchObject({ ok: false })
    expect(webview.postMessage).not.toHaveBeenCalled()
    expect(mockUpdate).toHaveBeenCalledTimes(1)
  } finally { subscription.dispose() }
})

test('concurrent saves are serialized and the last accepted choice wins', async () => {
  let finish: () => void
  mockUpdate.mockImplementationOnce((_key, value) => new Promise<void>((resolve) => {
    finish = () => { mockPreference = value; resolve() }
  }))
  const first = updateLanguagePreference('zh-CN')
  const second = updateLanguagePreference('en')
  await Promise.resolve(); await Promise.resolve()
  expect(mockUpdate).toHaveBeenCalledTimes(1)
  finish()
  const [one, two] = await Promise.all([first, second])
  expect(one.language).toBe('zh-CN')
  expect(two.language).toBe('en')
  expect(two.revision).toBeGreaterThan(one.revision)
  expect(getLanguageSnapshot().language).toBe('en')
  expect(workspace.getConfiguration).toHaveBeenCalledWith('imageViewer')
})
