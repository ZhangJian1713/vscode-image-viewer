import { centeredFolderScrollTop, FOLDER_TREE_ROW_HEIGHT } from './folderTreePosition'

const rows = Array.from({ length: 100 }, (_, i) => ({ key: `folder-${i}` }))

test('five highlighted folders fit together symmetrically around the tree viewport center', () => {
  const paths = rows.slice(40, 45).map((row) => row.key)
  const top = centeredFolderScrollTop(rows, paths, 320)!
  const before = 40 * FOLDER_TREE_ROW_HEIGHT - top
  const after = top + 320 - 45 * FOLDER_TREE_ROW_HEIGHT
  expect(before).toBe(80)
  expect(after).toBe(before)
  expect(centeredFolderScrollTop(rows, paths.slice().reverse(), 320)).toBe(top)
})

test('group extent includes unhighlighted ancestor rows between target folders', () => {
  const top = centeredFolderScrollTop(rows, ['folder-40', 'folder-44'], 320)!
  expect(top).toBe(1200)
})

test('oversized or scattered groups center an actual median highlight and clamp at list edges', () => {
  expect(centeredFolderScrollTop(rows, ['folder-0', 'folder-40', 'folder-99'], 320)).toBe(40.5 * 32 - 160)
  expect(centeredFolderScrollTop(rows, ['folder-0'], 320)).toBe(0)
  expect(centeredFolderScrollTop(rows, ['folder-99'], 320)).toBe(100 * 32 - 320)
  expect(centeredFolderScrollTop(rows, ['filtered-out'], 320)).toBeUndefined()
})
