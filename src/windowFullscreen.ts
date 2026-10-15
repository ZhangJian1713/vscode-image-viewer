import { commands } from 'vscode'

export type WindowFullscreenResult = { ok: true } | { ok: false; error: string }
let pending: Promise<WindowFullscreenResult> | undefined

/** WebViews may request this one host action; command IDs/arguments are never accepted. */
export function toggleWindowFullscreen(): Promise<WindowFullscreenResult> {
  if (!pending) {
    const operation = Promise.resolve()
      .then(() => commands.executeCommand('workbench.action.toggleFullScreen'))
      .then<WindowFullscreenResult, WindowFullscreenResult>(() => ({ ok: true }), (error: unknown) => ({
        ok: false, error: error instanceof Error ? error.message : 'Unable to toggle window fullscreen'
      }))
    pending = operation
    void operation.then(() => { if (pending === operation) { pending = undefined } })
  }
  return pending
}
