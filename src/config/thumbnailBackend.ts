export type ThumbnailBackend = 'imageio' | 'sharp'

/** Keep macOS on its system decoder; other desktop hosts use the bundled Sharp runtime. */
export function thumbnailBackend(platform = process.platform): ThumbnailBackend {
  return platform === 'darwin' ? 'imageio' : 'sharp'
}
