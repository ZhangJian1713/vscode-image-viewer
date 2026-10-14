export interface ThumbnailCacheEntry {
  path: string
  size: number
  mtimeMs: number
}

/** Returns oldest entries until both budgets reach the low-water mark; input is never mutated. */
export function thumbnailEvictionCandidates(
  files: ThumbnailCacheEntry[],
  maxBytes: number,
  maxFiles: number,
  targetRatio = 0.85
): ThumbnailCacheEntry[] {
  let bytes = files.reduce((sum, file) => sum + file.size, 0)
  let count = files.length
  if (bytes <= maxBytes && count <= maxFiles) {
    return []
  }
  const victims: ThumbnailCacheEntry[] = []
  for (const file of [...files].sort((one, other) => one.mtimeMs - other.mtimeMs)) {
    if (bytes <= maxBytes * targetRatio && count <= Math.floor(maxFiles * targetRatio)) {
      break
    }
    victims.push(file)
    bytes -= file.size
    count--
  }
  return victims
}
