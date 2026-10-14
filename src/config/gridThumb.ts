import { thumbnailBackend } from './thumbnailBackend'

/**
 * Grid thumbnail constants (decode tiers, cache limits, janitor policy, etc).
 *
 * The Webview chooses decode max-edge tiers (100 / 200 / 400 / 800 / 1600) from
 * column width via `thumbDecodeMaxEdgeFromCellWidth`.
 * Cache files are stored under `globalStorageUri/GRID_THUMB_GLOBAL_SUBDIR`.
 *
 * Full-size preview still uses the original `vscodePath`.
 */

/** Cache subdirectory name under globalStorage (must match runtime path). */
export const GRID_THUMB_GLOBAL_SUBDIR = 'image-viewer-grid-thumbs' as const

/**
 * Length of SHA256 hex prefix used in disk cache filenames (full digest remains 256-bit;
 * this only shortens filenames). File format: `{prefix}_{tier}.jpg`,
 * sharded by the first 2 chars of `prefix`.
 */
export const GRID_THUMB_CACHE_FILENAME_HASH_HEX_CHARS = 16

/**
 * Thumbnail max-edge tiers (ascending); maps 1:1 with `cellW < tier` branches in
 * `thumbDecodeMaxEdgeFromCellWidth`, and the final tier is the cap.
 */
export const THUMB_DECODE_EDGE_TIERS = [100, 200, 400, 800, 1600] as const

export type ThumbDecodeMaxEdgePx = (typeof THUMB_DECODE_EDGE_TIERS)[number]

/** Fallback tier (when old messages omit `targetMaxEdgePx`): the smallest tier. */
export const GRID_THUMB_FALLBACK_TARGET_EDGE_PX: ThumbDecodeMaxEdgePx = THUMB_DECODE_EDGE_TIERS[0]

/**
 * Normalize a requested value to one of {@link THUMB_DECODE_EDGE_TIERS}
 * (round up to the smallest tier that is not less than the request).
 */
export function normalizeThumbTierEdge(n: number): ThumbDecodeMaxEdgePx {
  const t = Math.round(Number(n))
  if (!Number.isFinite(t) || t <= 0) {
    return GRID_THUMB_FALLBACK_TARGET_EDGE_PX
  }
  for (const tier of THUMB_DECODE_EDGE_TIERS) {
    if (t <= tier) {
      return tier
    }
  }
  return THUMB_DECODE_EDGE_TIERS[THUMB_DECODE_EDGE_TIERS.length - 1]
}

/**
 * Choose decode max-edge tier from one square cell's CSS width (px):
 * `cellW` < 100 -> 100; < 200 -> 200; < 400 -> 400; < 800 -> 800; otherwise 1600.
 */
export function thumbDecodeMaxEdgeFromCellWidth(cellWidthPx: number): ThumbDecodeMaxEdgePx {
  if (!Number.isFinite(cellWidthPx) || cellWidthPx <= 0) {
    return GRID_THUMB_FALLBACK_TARGET_EDGE_PX
  }
  for (const tier of THUMB_DECODE_EDGE_TIERS) {
    if (cellWidthPx < tier) {
      return tier
    }
  }
  return THUMB_DECODE_EDGE_TIERS[THUMB_DECODE_EDGE_TIERS.length - 1]
}

/** Max memo entries for `resolveThumbForGrid` results. */
export const GRID_THUMB_RESOLVE_MEMO_MAX = 400

/** Output JPEG quality (roughly 0–100). */
export const GRID_THUMB_JPEG_QUALITY = 78

/**
 * Source files smaller than this byte size skip thumbnail generation
 * (grid uses original image directly). Currently 120 KiB.
 */
export const GRID_THUMB_MIN_SOURCE_BYTES = 120 * 1024

/**
 * Logical version in disk cache fingerprint; bump manually to invalidate old
 * thumbnails in bulk.
 */
export const GRID_THUMB_CACHE_VERSION = 1

/** Cached thumbnails use JPEG on all platforms. */
export function gridThumbDiskCacheExtension(): 'jpg' {
  return 'jpg'
}

/** Backend and orientation/alpha policy are part of the cache identity. */
export function gridThumbCacheProfile(targetTierEdge: number): string {
  const tier = normalizeThumbTierEdge(targetTierEdge)
  const mac = thumbnailBackend() === 'imageio'
  return [
    `v=${GRID_THUMB_CACHE_VERSION}`,
    `pipe=${mac ? 'mac-imageio-v1' : 'sharp-0.35.5-v1'}`,
    `tier=${tier}`,
    `q=${GRID_THUMB_JPEG_QUALITY}`,
    `aux=${mac ? 'transform+white' : 'orient+white'}`,
    'capO=1'
  ].join('|')
}

/** Max total bytes for global thumbnail cache. */
export const GRID_THUMB_MAX_CACHE_BYTES = 500 * 1024 * 1024

/** Max file count for global thumbnail cache. */
export const GRID_THUMB_MAX_CACHE_FILES = 25_000

/** Minimum interval (ms) between janitor runs. */
export const GRID_THUMB_JANITOR_MIN_INTERVAL_MS = 120_000

/** Janitor stop target: stop once total size is below `threshold * ratio`. */
export const GRID_THUMB_JANITOR_TARGET_RATIO = 0.85
