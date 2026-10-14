import type { IImage } from './imageTypes'
import { MESSAGE_CMD } from '../../constants'
import type { GalleryTransport } from './galleryBridge'

export interface ThumbnailSnapshot {
  status: 'queued' | 'loading' | 'ready' | 'error'
  src: string | null
  dimensions?: { width: number; height: number }
}

type Listener = (_snapshot: ThumbnailSnapshot) => void // eslint-disable-line no-unused-vars
type Entry = {
  key: string
  image: IImage
  tier: number
  snapshot: ThumbnailSnapshot
  listeners: Map<Listener, { priority: number; metadata: boolean }>
  pending: boolean
  metadataPending: boolean
  metadataResolved: boolean
  retryCount: number
}

export function galleryThumbnailKey(image: IImage, tier: number): string {
  return `${image.fullPath}\0${image.mtimeMs || 0}\0${image.size}\0${tier}`
}

/** 仅窗口内卡片持有订阅；取消排队的离屏请求，限制 RPC 并发与未使用的 URL memo。 */
export class GalleryThumbnailStore {
  private entries = new Map<string, Entry>()
  private running = 0
  private destroyed = false
  private pumping = false
  private timers = new Set<ReturnType<typeof setTimeout>>()

  constructor(private transport: GalleryTransport, private concurrency = 6, private idleLimit = 200) {}

  subscribe(image: IImage, tier: number, priority: number, metadata: boolean, listener: Listener): () => void {
    const key = galleryThumbnailKey(image, tier)
    let entry = this.entries.get(key)
    if (!entry) {
      entry = {
        key,
        image,
        tier,
        snapshot: { status: 'queued', src: null },
        listeners: new Map(),
        pending: false,
        metadataPending: false,
        metadataResolved: false,
        retryCount: 0
      }
      this.entries.set(key, entry)
    } else {
      this.entries.delete(key)
      this.entries.set(key, entry)
    }
    entry.listeners.set(listener, { priority, metadata })
    listener(entry.snapshot)
    this.pump()
    return () => {
      entry!.listeners.delete(listener)
      if (!entry!.listeners.size && !entry!.pending && !entry!.metadataPending && entry!.snapshot.status === 'queued') {
        this.entries.delete(key)
      }
      this.prune()
    }
  }

  retry(image: IImage, tier: number, explicit = false): void {
    const entry = this.entries.get(galleryThumbnailKey(image, tier))
    if (!entry || entry.pending) {
      return
    }
    if (!explicit && (entry.retryCount >= 1 || entry.snapshot.src === image.vscodePath)) {
      entry.snapshot = { ...entry.snapshot, status: 'error', src: null }
      this.publish(entry)
      return
    }
    entry.retryCount = explicit ? 0 : entry.retryCount + 1
    entry.snapshot = { ...entry.snapshot, status: 'queued', src: null }
    this.publish(entry)
    this.pump()
  }

  private priority(entry: Entry): number {
    let priority = -Infinity
    entry.listeners.forEach((interest) => {
      priority = Math.max(priority, interest.priority)
    })
    return priority
  }

  private pump(): void {
    if (this.destroyed || this.pumping) {
      return
    }
    this.pumping = true
    try {
      while (this.running < this.concurrency) {
        let next: Entry | undefined
        let metadata = false
        let priority = -Infinity
        for (const entry of this.entries.values()) {
          if (!entry.listeners.size) {
            continue
          }
          const needsThumb = entry.snapshot.status === 'queued' && !entry.pending
          const needsMetadata =
            entry.snapshot.status === 'ready' &&
            !entry.metadataResolved &&
            !entry.metadataPending &&
            Array.from(entry.listeners.values()).some((interest) => interest.metadata)
          const score = this.priority(entry) - (needsThumb ? 0 : 100)
          if ((needsThumb || needsMetadata) && score > priority) {
            next = entry
            metadata = !needsThumb
            priority = score
          }
        }
        if (!next) {
          break
        }
        this.request(next, metadata)
      }
    } finally {
      this.pumping = false
    }
  }

  private request(entry: Entry, metadata: boolean): void {
    this.running++
    if (metadata) {
      entry.metadataPending = true
    } else {
      entry.pending = true
      entry.snapshot = { ...entry.snapshot, status: 'loading' }
      this.publish(entry)
    }
    let finished = false
    const finish = (value: any) => {
      if (finished) {
        return
      }
      finished = true
      clearTimeout(timer)
      this.timers.delete(timer)
      this.running--
      if (this.destroyed) {
        return
      }
      if (metadata) {
        entry.metadataPending = false
        entry.metadataResolved = true
        const dimensions =
          value?.width > 0 && value?.height > 0 ? { width: value.width, height: value.height } : undefined
        entry.snapshot = { ...entry.snapshot, dimensions }
      } else {
        entry.pending = false
        entry.snapshot = {
          ...entry.snapshot,
          status: value ? 'ready' : 'error',
          src: value ? (value.kind === 'thumb' ? value.thumbSrc : entry.image.vscodePath) : null
        }
      }
      this.publish(entry)
      this.prune()
      this.pump()
    }
    const timer = setTimeout(() => finish(null), 30_000)
    this.timers.add(timer)
    try {
      this.transport(
        {
          cmd: metadata ? MESSAGE_CMD.GET_IMAGE_SIZE : MESSAGE_CMD.GET_THUMB_FOR_GRID,
          data: { filePath: entry.image.fullPath, targetMaxEdgePx: entry.tier }
        },
        finish
      )
    } catch {
      finish(null)
    }
  }

  private publish(entry: Entry): void {
    entry.listeners.forEach((_interest, listener) => listener(entry.snapshot))
  }

  private prune(): void {
    let idle = 0
    for (const entry of this.entries.values()) {
      if (!entry.listeners.size && !entry.pending && !entry.metadataPending) {
        idle++
      }
    }
    for (const [key, entry] of this.entries) {
      if (idle <= this.idleLimit) {
        break
      }
      if (!entry.listeners.size && !entry.pending && !entry.metadataPending) {
        this.entries.delete(key)
        idle--
      }
    }
  }

  get stats(): { entries: number; subscribers: number; running: number } {
    let subscribers = 0
    this.entries.forEach((entry) => {
      subscribers += entry.listeners.size
    })
    return { entries: this.entries.size, subscribers, running: this.running }
  }

  destroy(): void {
    this.destroyed = true
    this.timers.forEach(clearTimeout)
    this.timers.clear()
    this.entries.clear()
  }
}
