import * as path from 'path'
import { RelativePattern, Uri, WebviewPanel, workspace } from 'vscode'
import { IMAGE_FILE_PATTERNS, MESSAGE_CMD } from '../../constants'

const REFRESH_DELAY_MS = 3000
const imageExtensions = new Set(IMAGE_FILE_PATTERNS.map((pattern) => pattern.slice(1)))

/** One root-bound subscription per gallery. File events invalidate snapshots, never restart an active scan. */
export function createGalleryFileWatcher(panel: WebviewPanel, root: string) {
  const watcher = workspace.createFileSystemWatcher(new RelativePattern(Uri.file(root), '**/*'))
  let disposed = false
  let ready = false
  let revision = 0
  let coveredRevision = 0
  let notifiedRevision = 0
  let lastChangedAt = 0
  let requestId: number
  let activeScan: object | undefined
  let timer: ReturnType<typeof setTimeout> | undefined

  function schedule() {
    clearTimeout(timer)
    if (disposed || !ready || activeScan || !panel.visible || revision <= coveredRevision || revision <= notifiedRevision) { return }
    timer = setTimeout(() => {
      if (disposed || activeScan || !panel.visible) { return }
      const sentRevision = revision
      notifiedRevision = sentRevision
      // The frontend ignores invalidations superseded by a newer manual/initial scan.
      void Promise.resolve(panel.webview.postMessage({ cmd: MESSAGE_CMD.GALLERY_FILES_CHANGED,
        data: { projectPath: root, requestId } })).then((delivered) => {
        if (!delivered && notifiedRevision === sentRevision) { notifiedRevision = coveredRevision }
      }, () => {
        if (notifiedRevision === sentRevision) { notifiedRevision = coveredRevision }
      })
    }, Math.max(0, lastChangedAt + REFRESH_DELAY_MS - Date.now()))
  }

  function changed(uri: Uri, contentOnly = false) {
    if (disposed) { return }
    const relative = path.relative(root, uri.fsPath)
    if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) { return }
    if (relative.split(path.sep).some((part) => part === '.git' || part === 'node_modules' || part.startsWith('._'))) { return }
    if (contentOnly && !imageExtensions.has(path.extname(uri.fsPath).toLowerCase())) { return }
    // Create/delete may report only the parent directory for an entire copied/deleted tree.
    // Do not filter these events by image suffix or stat a potentially already deleted path.
    revision++
    lastChangedAt = Date.now()
    schedule()
  }

  const subscriptions = [watcher.onDidCreate((uri) => changed(uri)),
    watcher.onDidDelete((uri) => changed(uri)), watcher.onDidChange((uri) => changed(uri, true)),
    panel.onDidChangeViewState(() => schedule())]

  return {
    beginScan(id: number): object {
      ready = true
      requestId = id
      coveredRevision = revision
      activeScan = {}
      clearTimeout(timer)
      return activeScan
    },
    endScan(token: object) {
      if (token !== activeScan) { return }
      activeScan = undefined
      // A scan covers events received before it started. Later changes require one follow-up.
      schedule()
    },
    dispose() {
      if (disposed) { return }
      disposed = true
      clearTimeout(timer)
      subscriptions.forEach((subscription) => subscription.dispose())
      watcher.dispose()
    }
  }
}
