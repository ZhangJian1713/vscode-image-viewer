import { thumbnailEvictionCandidates } from './thumbnailCachePolicy'

test('prunes oldest files to both low-water marks when either budget is exceeded', () => {
  const files = Array.from({ length: 10 }, (_, index) => ({ path: String(index), size: 10, mtimeMs: index }))
  expect(thumbnailEvictionCandidates(files, 80, 20, 0.75).map((file) => file.path)).toEqual(['0', '1', '2', '3'])
  expect(thumbnailEvictionCandidates(files, 1000, 8, 0.75).map((file) => file.path)).toEqual(['0', '1', '2', '3'])
  expect(files).toHaveLength(10)
})

test('leaves under-budget caches intact and handles one oversized file', () => {
  expect(thumbnailEvictionCandidates([{ path: 'small', size: 10, mtimeMs: 0 }], 100, 5)).toEqual([])
  expect(thumbnailEvictionCandidates([{ path: 'large', size: 200, mtimeMs: 0 }], 100, 5)).toHaveLength(1)
})
