import type { ImageSortMode } from '../../types'
import { completeGalleryImages, imageFolder } from './galleryModel'
import { GALLERY_SORT_OPTIONS, gallerySortFromSelection, gallerySortSelection, sortGalleryImages } from './gallerySort'

function image(path: string, size = 0, mtimeMs = 0) {
  return completeGalleryImages([{ path, vscodePath: path, size, mtimeMs }], '/project')[0]
}

test('folders remain contiguous in natural tree order, with parents before their descendants', () => {
  const input = [image('/folder10/a.png'), image('/folder2/child/a.png'), image('/folder2/b.png'), image('/root.png'), image('/folder2/a.png'), image('/folder2-other/a.png')]
  const original = [...input]
  expect(sortGalleryImages(input, 'nameDesc', true).map((item) => item.path)).toEqual([
    '/root.png', '/folder2/b.png', '/folder2/a.png', '/folder2/child/a.png', '/folder2-other/a.png', '/folder10/a.png'
  ])
  expect(input).toEqual(original)
})

test.each<[ImageSortMode, string[]]>([
  ['nameAsc', ['image2.webp', 'image10.png', 'image20.jpg']],
  ['nameDesc', ['image20.jpg', 'image10.png', 'image2.webp']],
  ['mtimeAsc', ['image10.png', 'image20.jpg', 'image2.webp']],
  ['mtimeDesc', ['image2.webp', 'image20.jpg', 'image10.png']],
  ['sizeAsc', ['image20.jpg', 'image2.webp', 'image10.png']],
  ['sizeDesc', ['image10.png', 'image2.webp', 'image20.jpg']],
  ['typeAsc', ['image20.jpg', 'image10.png', 'image2.webp']],
  ['typeDesc', ['image2.webp', 'image10.png', 'image20.jpg']]
])('%s sorts each folder independently and never reverses folder order', (mode, names) => {
  const input = ['b', 'a'].map((folder) => [
    image(`/${folder}/image10.png`, 30, 10), image(`/${folder}/image2.webp`, 20, 30), image(`/${folder}/image20.jpg`, 10, 20)
  ]).reduce((all, bucket) => all.concat(bucket), [])
  const result = sortGalleryImages(input, mode, true)
  expect(result.map(imageFolder)).toEqual(Array(3).fill('/project/a').concat(Array(3).fill('/project/b')))
  expect(result.map((item) => item.fileName)).toEqual([...names, ...names])
})

test('global sorting mixes folders; switching back restores the complete grouped sequence', () => {
  const input = [image('/a/z.png', 5), image('/b/b.png', 2), image('/a/a.png', 10)]
  expect(sortGalleryImages(input, 'nameAsc', false).map((item) => item.path)).toEqual(['/a/a.png', '/b/b.png', '/a/z.png'])
  expect(sortGalleryImages(input, 'sizeAsc', false).map((item) => item.path)).toEqual(['/b/b.png', '/a/z.png', '/a/a.png'])
  expect(sortGalleryImages(input, 'nameAsc', true).map((item) => item.path)).toEqual(['/a/a.png', '/a/z.png', '/b/b.png'])
})

test('equal metadata has deterministic natural-name and path ties, independent of scan order', () => {
  const input = [image('/b/image10.PNG'), image('/a/image2.png'), image('/b/image2.png')]
  for (const mode of ['sizeAsc', 'mtimeDesc', 'typeAsc'] as ImageSortMode[]) {
    expect(sortGalleryImages(input, mode, false).map((item) => item.path)).toEqual(['/a/image2.png', '/b/image2.png', '/b/image10.PNG'])
    expect(sortGalleryImages([...input].reverse(), mode, false)).toEqual(sortGalleryImages(input, mode, false))
  }
})

test('every UI option persists both sorting levels and restores the selected label', () => {
  for (const group of GALLERY_SORT_OPTIONS) {
    for (const option of group.options) {
      const state = gallerySortFromSelection(option.value)
      expect(gallerySortSelection(state.imageSort, state.galleryGroupByFolder)).toBe(option.value)
    }
  }
})

test('a large single folder is flattened without exceeding the argument limit', () => {
  const input = Array.from({ length: 150000 }, (_, index) => image(`/a/image${150000 - index}.png`))
  const result = sortGalleryImages(input, 'nameAsc', true)
  expect(result).toHaveLength(input.length)
  expect(result[0].fileName).toBe('image1.png')
  expect(result[result.length - 1].fileName).toBe('image150000.png')
})
