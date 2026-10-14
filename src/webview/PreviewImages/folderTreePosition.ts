export const FOLDER_TREE_ROW_HEIGHT = 32

/** 按整组高亮的边界居中；整组超高时以中位高亮行居中，避免停在没有高亮的空档。 */
export function centeredFolderScrollTop(
  rows: readonly { key: string }[],
  paths: readonly string[],
  viewportHeight: number
): number | undefined {
  if (viewportHeight <= 0 || !paths.length) {
    return undefined
  }
  const targets = new Set(paths)
  const positions: number[] = []
  rows.forEach((row, index) => { if (targets.has(row.key)) { positions.push(index) } })
  if (!positions.length) {
    return undefined
  }
  const first = positions[0]
  const last = positions[positions.length - 1]
  const fits = (last - first + 1) * FOLDER_TREE_ROW_HEIGHT <= viewportHeight
  const midpoint = fits ? (first + last + 1) / 2 : positions[Math.floor(positions.length / 2)] + 0.5
  return Math.max(0, Math.min(rows.length * FOLDER_TREE_ROW_HEIGHT - viewportHeight,
    midpoint * FOLDER_TREE_ROW_HEIGHT - viewportHeight / 2))
}
