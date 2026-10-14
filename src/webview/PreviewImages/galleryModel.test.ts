import {
  buildGalleryFolderIndex,
  completeGalleryImages,
  folderAncestors,
  galleryRelativePath,
  isPathWithinFolder,
  normalizedGalleryConfig,
  visibleFolderRows
} from './galleryModel'

const image = (path: string) => completeGalleryImages([{ path, vscodePath: path, size: 100 }], '/project')[0]

test('counts direct images separately and preserves image-bearing ancestors', () => {
  const index = buildGalleryFolderIndex(
    [image('/root.png'), image('/assets/icons/a.svg'), image('/assets/icons/b.svg'), image('/assets/photos/c.jpg')],
    '/project'
  )
  expect(index.folders.get('/project')!.totalCount).toBe(4)
  expect(index.folders.get('/project')!.directCount).toBe(1)
  expect(index.folders.get('/project/assets')!.directCount).toBe(0)
  expect(index.folders.get('/project/assets')!.totalCount).toBe(3)
  expect(index.folders.get('/project/assets/icons')!.totalCount).toBe(2)
  expect(folderAncestors(index, '/project/assets/icons')).toEqual([
    '/project',
    '/project/assets',
    '/project/assets/icons'
  ])
})

test('folder matching uses path boundaries, normalizes separators and Windows drive casing', () => {
  expect(isPathWithinFolder('/project/assets-old/a.png', '/project/assets')).toBe(false)
  expect(isPathWithinFolder('/project/assets/a.png', '/project/assets')).toBe(true)
  expect(isPathWithinFolder('C:\\Project\\Assets\\a.png', 'c:/project/assets')).toBe(true)
  expect(galleryRelativePath('C:\\Project\\Assets\\a.png', 'c:/project')).toBe('Assets/a.png')
})

test('tree expansion affects only visible descendants and supports collapsing the root', () => {
  const index = buildGalleryFolderIndex([image('/a/child/x.png'), image('/b/y.png')], '/project')
  expect(visibleFolderRows(index, new Set())).toEqual([{ key: '/project', depth: 0 }])
  expect(visibleFolderRows(index, new Set(['/project'])).map((row) => row.key)).toEqual([
    '/project',
    '/project/a',
    '/project/b'
  ])
  expect(visibleFolderRows(index, new Set(['/project', '/project/a'])).map((row) => row.key)).toContain(
    '/project/a/child'
  )
})

test('legacy preferences migrate without losing deliberate empty expansion or hidden sidebar', () => {
  expect(normalizedGalleryConfig({}).galleryLayout).toBe('fill')
  expect(normalizedGalleryConfig({}).galleryGroupByFolder).toBe(true)
  expect(normalizedGalleryConfig({ galleryGroupByFolder: false }).galleryGroupByFolder).toBe(false)
  expect(normalizedGalleryConfig({}).galleryShowFileSize).toBe(true)
  expect(normalizedGalleryConfig({ galleryShowFileSize: false }).galleryShowFileSize).toBe(false)
  expect(normalizedGalleryConfig({}).galleryExpandedFolders).toBeUndefined()
  expect(
    normalizedGalleryConfig({ galleryExpandedFolders: [], gallerySidebarVisible: false, imageGridColumns: 100 })
      .galleryExpandedFolders
  ).toEqual([])
  expect(normalizedGalleryConfig({ gallerySidebarVisible: false }).gallerySidebarVisible).toBe(false)
  expect(normalizedGalleryConfig({ imageGridColumns: 100 }).imageGridColumns).toBe(20)
})

test('scoped folder index never imports siblings from the project', () => {
  const index = buildGalleryFolderIndex([image('/a/x.png'), image('/ab/y.png')], '/project/a')
  expect(Array.from(index.folders.keys())).toEqual(['/project/a'])
  expect(index.folders.get('/project/a')!.totalCount).toBe(1)
})
