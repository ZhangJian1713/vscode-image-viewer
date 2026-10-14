import { compileFolderFilters, parseFolderFilterInput } from './folderFilterRules'

test('literal directories retain subtree semantics and path boundaries', () => {
  const plan = compileFolderFilters(['/assets/icons/'], ['assets/icons/generated'])
  expect(plan.scanRoots()).toEqual(['assets/icons'])
  expect(compileFolderFilters(['./assets/./icons/'], []).scanRoots()).toEqual(['assets/icons'])
  expect(plan.includes('assets/icons/child')).toBe(true)
  expect(plan.includes('assets/icons-old')).toBe(false)
  expect(plan.excludes('assets/icons/generated/nested')).toBe(true)
  expect(plan.excludes('assets/icons/generated-old')).toBe(false)
})

test('standard globs, braces, character classes, hidden folders and descendant inheritance', () => {
  const plan = compileFolderFilters(['assets/{photos,icons}/set-00[12]', '.hidden/**'], ['**/test-*'])
  expect(plan.includes('assets/photos/set-001/nested')).toBe(true)
  expect(plan.includes('assets/icons/set-002')).toBe(true)
  expect(plan.includes('assets/photos/set-003')).toBe(false)
  expect(plan.includes('.hidden/deep')).toBe(true)
  expect(plan.excludes('assets/photos/test-cache/deep')).toBe(true)
  expect(compileFolderFilters(['assets/?'], []).includes('assets/a/nested')).toBe(true)
  expect(compileFolderFilters(['**'], []).includes('')).toBe(true)
  expect(compileFolderFilters([], ['**/{dist,build}/**']).excludes('a/dist')).toBe(true)
})

test('static scan roots intersect explicit scope and avoid visiting unrelated roots', () => {
  const plan = compileFolderFilters(['assets/photos/**', 'assets/photos/nested', 'media/**'], ['**/build'])
  expect(plan.scanRoots()).toEqual(['media', 'assets/photos'])
  expect(plan.scanRoots('assets')).toEqual(['assets/photos'])
  expect(plan.scanRoots('assets/photos/child')).toEqual(['assets/photos/child'])
  expect(plan.scanRoots('other')).toEqual([])
  expect(plan.scanRoots('media/build/child')).toEqual([])
})

test('Windows paths normalize separators and respect the host casing policy', () => {
  const plan = compileFolderFilters(['Assets\\Photos\\**'], [], true)
  expect(plan.includes('assets/photos/child')).toBe(true)
  expect(plan.scanRoots('ASSETS')).toEqual(['assets/photos'])
  expect(compileFolderFilters(['Assets/Photos'], []).includes('assets/photos')).toBe(false)
})

test('line parsing preserves brace commas, comma directory names and removes duplicate rules', () => {
  expect(parseFolderFilterInput(' assets/{icons,photos}/**\r\nold,photos\nassets/{icons,photos}/**\n')).toEqual([
    'assets/{icons,photos}/**',
    'old,photos'
  ])
})

test('invalid expressions, traversal, extglobs and oversized rules fail explicitly', () => {
  for (const pattern of [
    'assets/[ab',
    'assets/{a,b',
    '../outside',
    'assets/../outside',
    'C:/outside',
    '!assets',
    '+(a|aa)',
    'x'.repeat(513)
  ]) {
    expect(() => compileFolderFilters([pattern], [])).toThrow()
  }
  expect(() => compileFolderFilters(Array(65).fill('assets'), [])).toThrow('64')
})
