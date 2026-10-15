import { MESSAGE_CMD } from '../constants'
import type { GalleryTransport } from './PreviewImages/galleryBridge'

export interface FilmstripThumbnail {
  src: string | null
  error: boolean
}
type Entry = FilmstripThumbnail & { pending: boolean }

/** One preview owns bounded URL results; all actual generation shares the host's six-slot queue. */
export class FilmstripThumbnailStore {
  private entries = new Map<string, Entry>()
  private desired: string[] = []
  private running = 0
  private pumping = false
  private epoch = 0
  private active = false
  private timers = new Set<ReturnType<typeof setTimeout>>()
  private notify: () => void = () => {}

  constructor(private transport: GalleryTransport) {}

  activate(notify: () => void): void { this.active = true; this.notify = notify }
  snapshot(id: string): FilmstripThumbnail | undefined { return this.entries.get(id) }
  snapshots(): ReadonlyMap<string, FilmstripThumbnail> { return new Map(this.entries) }

  setDemand(ids: string[]): void {
    this.desired = Array.from(new Set(ids))
    this.pump()
  }

  private pump(): void {
    if (!this.active || this.pumping) { return }
    this.pumping = true
    try {
      while (this.running < 6) {
        const id = this.desired.find((value) => !this.entries.has(value))
        if (!id) { break }
        this.request(id)
      }
    } finally { this.pumping = false }
  }

  private request(id: string): void {
    const epoch = this.epoch
    this.entries.set(id, { src: null, error: false, pending: true })
    this.running++
    let completed = false
    const finish = (result?: { kind?: string; thumbSrc?: unknown }) => {
      if (completed || epoch !== this.epoch) { return }
      completed = true
      clearTimeout(timer)
      this.timers.delete(timer)
      this.running--
      const src = result?.kind === 'thumb' && typeof result.thumbSrc === 'string' && result.thumbSrc
        ? result.thumbSrc : null
      this.entries.delete(id)
      this.entries.set(id, { src, error: !src, pending: false })
      // Cache only a bounded history; demand and in-flight requests must not be evicted.
      const desired = new Set(this.desired)
      for (const [key, entry] of this.entries) {
        if (this.entries.size <= 200) { break }
        if (!entry.pending && !desired.has(key)) { this.entries.delete(key) }
      }
      if (this.active) { this.notify(); this.pump() }
    }
    const timer = setTimeout(() => finish(), 30_000)
    this.timers.add(timer)
    try { this.transport({ cmd: MESSAGE_CMD.GET_FILMSTRIP_THUMBNAIL, data: { id } }, finish) }
    catch { finish() }
  }

  destroy(): void {
    this.active = false
    this.epoch++
    this.timers.forEach(clearTimeout)
    this.timers.clear()
    this.entries.clear()
    this.desired = []
    this.running = 0
    this.notify = () => {}
  }
}
