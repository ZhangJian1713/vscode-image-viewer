import { MESSAGE_CMD } from './constants'
import { getPreviewPreferences, previewPreferencesRequest, registerPreviewPreferences, trackPreviewPreferences } from './previewPreferencesHost'
let mockValue: unknown = false
let mockChanged: (event: { affectsConfiguration: (_key: string) => boolean }) => void
const mockUpdate = jest.fn(async (_key, value) => { mockValue = value })
jest.mock('vscode', () => ({ ConfigurationTarget: { Global: 1 }, workspace: {
  getConfiguration: () => ({ get: () => mockValue, update: mockUpdate }),
  onDidChangeConfiguration: (callback) => { mockChanged = callback; return { dispose() {} } }
} }), { virtual: true })
beforeEach(() => { mockValue = false; mockUpdate.mockReset(); mockUpdate.mockImplementation(async (_key, value) => { mockValue = value }) })

test('defaults hidden and persists one shared user setting to all live previews', async () => {
  expect(getPreviewPreferences().showMirrorButtons).toBe(false)
  mockValue = 'true'
  expect(getPreviewPreferences().showMirrorButtons).toBe(false)
  mockValue = false
  registerPreviewPreferences({ subscriptions: [] } as any)
  const one = { postMessage: jest.fn(async () => true) } as any
  const two = { postMessage: jest.fn(async () => true) } as any
  const first = trackPreviewPreferences(one), second = trackPreviewPreferences(two)
  try {
    const result = await previewPreferencesRequest(MESSAGE_CMD.SET_PREVIEW_PREFERENCES, true)
    expect(mockUpdate).toHaveBeenCalledWith('showMirrorButtons', true, 1)
    expect(result.snapshot.showMirrorButtons).toBe(true)
    expect(one.postMessage).toHaveBeenLastCalledWith({ cmd: MESSAGE_CMD.PREVIEW_PREFERENCES_CHANGED, data: result.snapshot })
    expect(two.postMessage).toHaveBeenCalledTimes(1)
    second.dispose(); two.postMessage.mockClear(); mockValue = false
    mockChanged({ affectsConfiguration: (key) => key === 'imageViewer.showMirrorButtons' })
    expect(one.postMessage.mock.calls.pop()[0].data.showMirrorButtons).toBe(false)
    expect(two.postMessage).not.toHaveBeenCalled()
  } finally { first.dispose(); second.dispose() }
})

test('rejects invalid writes and reports failed saves without changing the preference', async () => {
  expect(await previewPreferencesRequest(MESSAGE_CMD.SET_PREVIEW_PREFERENCES, 'true')).toMatchObject({ ok: false })
  expect(mockUpdate).not.toHaveBeenCalled()
  mockUpdate.mockRejectedValueOnce(new Error('read only'))
  expect(await previewPreferencesRequest(MESSAGE_CMD.SET_PREVIEW_PREFERENCES, true))
    .toMatchObject({ ok: false, snapshot: { showMirrorButtons: false } })
})

test('serializes concurrent saves so the last accepted preference wins', async () => {
  let finish: () => void
  mockUpdate.mockImplementationOnce((_key, value) => new Promise<void>((resolve) => {
    finish = () => { mockValue = value; resolve() }
  }))
  const first = previewPreferencesRequest(MESSAGE_CMD.SET_PREVIEW_PREFERENCES, true)
  const second = previewPreferencesRequest(MESSAGE_CMD.SET_PREVIEW_PREFERENCES, false)
  await Promise.resolve(); await Promise.resolve()
  expect(mockUpdate).toHaveBeenCalledTimes(1)
  finish()
  const [one, two] = await Promise.all([first, second])
  expect(one.snapshot.showMirrorButtons).toBe(true)
  expect(two.snapshot.showMirrorButtons).toBe(false)
  expect(two.snapshot.revision).toBeGreaterThan(one.snapshot.revision)
})
