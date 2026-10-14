import { GalleryEntry } from '../../galleryEntry'
import { buildGalleryFolderIndex, completeGalleryImages } from './galleryModel'
import { nearestGalleryFolder, resolveGalleryNavigation } from './galleryNavigation'

const root = '/project'
const images = completeGalleryImages([
  { path: '/assets/photos/1.jpg', vscodePath: 'one', size: 1 },
  { path: '/assets/photos/deep/2.png', vscodePath: 'two', size: 2 },
  { path: '/other/3.jpg', vscodePath: 'three', size: 3 }
], root)
const index = buildGalleryFolderIndex(images, root)
const entry = (path: string, kind: GalleryEntry['kind']): GalleryEntry =>
  ({ __imageViewerEntry: true, rootPath: root, targetPath: root + path, kind })

test('file and empty-folder entries choose the nearest resource-bearing ancestor, never a sibling', () => {
  expect(resolveGalleryNavigation(entry('/assets/configs/app.json', 'file'), index, images, true)?.folder).toBe('/project/assets')
  expect(resolveGalleryNavigation(entry('/assets/empty/deep', 'folder'), index, images, true)?.folder).toBe('/project/assets')
  expect(nearestGalleryFolder(index, '/project/assets/photos')).toBe('/project/assets/photos')
  expect(nearestGalleryFolder(index, '/different/project')).toBe(root)
})
test('folders with descendant images remain selectable; image entries target the immediate directory', () => {
  expect(resolveGalleryNavigation(entry('/assets', 'folder'), index, images, true)).toMatchObject({ folder: '/project/assets', fallback: false })
  expect(resolveGalleryNavigation(entry('/assets/photos/deep/2.png', 'image'), index, images, false)).toMatchObject({
    folder: '/project/assets/photos/deep', image: images[1], previewOnly: false
  })
})
test('an incomplete index cannot prove an empty folder or missing image, even if the root already exists', () => {
  expect(resolveGalleryNavigation(entry('/assets/empty', 'folder'), index, images, false)).toBeNull()
  expect(resolveGalleryNavigation(entry('/other/later.jpg', 'image'), index, images, false)).toBeNull()
  const empty = buildGalleryFolderIndex([], root)
  expect(resolveGalleryNavigation(entry('/empty', 'folder'), empty, [], true)?.folder).toBe(root)
  expect(resolveGalleryNavigation(entry('/empty', 'folder'), empty, [], false)).toBeNull()
})
test('an explicitly requested image excluded from scanning can still open alone without enlarging the scan scope', () => {
  const excluded = completeGalleryImages([{ path: '/excluded/secret.jpg', vscodePath: 'explicit', size: 1 }], root)[0]
  const result = resolveGalleryNavigation(entry('/excluded/secret.jpg', 'image'), index, images, true, excluded)
  expect(result).toMatchObject({ folder: root, image: excluded, previewOnly: true, fallback: true })
  expect(index.folders.has('/project/excluded')).toBe(false)
})

test('encoded entry paths survive HTML-sensitive names and malformed encoding is rejected', () => {
  const { galleryEntryFromArg, galleryEntryToArg } = require('../../galleryEntry')
  const input = entry('/特殊目录/<"&/a.jpg', 'image')
  const encoded = galleryEntryToArg(input)
  expect(galleryEntryFromArg(encoded)).toEqual(input)
  expect(JSON.stringify(encoded)).not.toContain('<')
  expect(galleryEntryFromArg({ ...encoded, targetPathEncoded: '%not-encoding' })).toBeUndefined()
})

test('Explorer navigation leaves matching filters intact and only relaxes filters hiding the target', () => {
  const { galleryNavigationFilters } = require('./galleryNavigation')
  const config = { keyword: 'photos', showImageTypes: ['.jpg'], includeFolders: ['assets'], excludeFolders: ['other'],
    galleryIncludeSubfolders: false, activeKey: [], backgroundColor: 'transparent' }
  const resolution = resolveGalleryNavigation(entry('/assets/photos/1.jpg', 'image'), index, images, true)
  expect(galleryNavigationFilters(resolution, images, config)).toBeNull()
  const blocked = { ...config, keyword: 'unrelated', showImageTypes: ['.png'] }
  expect(galleryNavigationFilters(resolution, images, blocked)).toEqual({ keyword: '', showImageTypes: ['.png', 'jpg'] })
  expect(blocked.keyword).toBe('unrelated')
  expect(blocked.showImageTypes).toEqual(['.png'])
  expect(blocked.galleryIncludeSubfolders).toBe(false)
  expect(blocked.excludeFolders).toEqual(['other'])
})

test('newly requested images enrich the cached gallery only inside scan rules, without changing existing snapshots', () => {
  const { includeGalleryEntryImage } = require('./galleryNavigation')
  const image = completeGalleryImages([{ path: '/assets/new/b.jpg', vscodePath: 'b', size: 1 }], root)[0]
  const config = { includeFolders: ['assets'], excludeFolders: [] }
  const updated = includeGalleryEntryImage(images, image, root, config)
  expect(updated).toHaveLength(images.length + 1)
  expect(images).toHaveLength(3)
  expect(includeGalleryEntryImage(updated, image, root, config)).toBe(updated)
  expect(includeGalleryEntryImage(images, image, root, { ...config, excludeFolders: ['assets/new'] })).toBe(images)
  expect(includeGalleryEntryImage(images, image, '/other', config)).toBe(images)
  const winImage = completeGalleryImages([{ path: '/assets/a.jpg', vscodePath: 'win', size: 1 }], 'C:/project')[0]
  expect(includeGalleryEntryImage([], winImage, 'C:/project', { includeFolders: ['ASSETS'], excludeFolders: [] })).toEqual([winImage])
})
