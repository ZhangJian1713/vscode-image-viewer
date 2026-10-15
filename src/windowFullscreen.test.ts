import { commands } from 'vscode'
import { toggleWindowFullscreen } from './windowFullscreen'

jest.mock('vscode', () => ({ commands: { executeCommand: jest.fn() } }), { virtual: true })
const execute = commands.executeCommand as jest.Mock
beforeEach(() => { execute.mockReset() })

test('runs only the fixed VS Code window fullscreen command and reports acceptance', async () => {
  execute.mockResolvedValue(undefined)
  await expect(toggleWindowFullscreen()).resolves.toEqual({ ok: true })
  expect(execute).toHaveBeenCalledWith('workbench.action.toggleFullScreen')
})
test('shares a pending transition across gallery and single-editor requests', async () => {
  let finish: () => void
  execute.mockImplementation(() => new Promise<void>((resolve) => { finish = resolve }))
  const first = toggleWindowFullscreen(), second = toggleWindowFullscreen()
  expect(first).toBe(second)
  await Promise.resolve()
  expect(execute).toHaveBeenCalledTimes(1)
  finish!()
  await expect(first).resolves.toEqual({ ok: true })
})
test('reports command rejection, clears the pending action and permits retry', async () => {
  execute.mockRejectedValueOnce(new Error('denied')).mockResolvedValueOnce(undefined)
  await expect(toggleWindowFullscreen()).resolves.toEqual({ ok: false, error: 'denied' })
  await expect(toggleWindowFullscreen()).resolves.toEqual({ ok: true })
  expect(execute).toHaveBeenCalledTimes(2)
})
