import { folderHudModel, folderHudPosition, visibleGalleryFolders } from './galleryViewportFolders'
import { galleryGeometry } from './galleryLayout'
import { completeGalleryImages } from './galleryModel'

const images = completeGalleryImages(Array.from({ length: 1000 }, (_, index) => ({
  path: `trip/day-${Math.floor(index / 10)}/${index}.png`, vscodePath: `mock:${index}`, size: 100
})), '/project')

test('visible folders exclude overscan, fully hidden images, captions and gaps', () => {
  const geometry = galleryGeometry(images.length, 400, 2, 'grid', false)
  const top = geometry.padding + 4 * geometry.rowStride
  expect(visibleGalleryFolders(images, geometry, top, geometry.rowStride * 2)).toEqual([
    '/project/trip/day-0', '/project/trip/day-1'
  ])
  expect(visibleGalleryFolders(images, geometry, top + geometry.imageEdge, geometry.captionHeight)).toEqual([])
  expect(visibleGalleryFolders([], geometry, 0, 600)).toEqual([])
})

test('all layouts deduplicate in visual order and include the last image at the bottom', () => {
  for (const mode of ['fill', 'grid', 'list'] as const) {
    const geometry = galleryGeometry(images.length, 900, 8, mode, true)
    expect(visibleGalleryFolders(images, geometry, geometry.totalHeight - 100, 100)).toContain('/project/trip/day-99')
  }
})

test('HUD bounds rows and compresses only a meaningful common ancestor', () => {
  const paths = Array.from({ length: 100 }, (_, i) => `/project/trip/day-1/folder-${i}`)
  const model = folderHudModel(paths, '/project', 600)
  expect(model.header).toBe('trip/day-1')
  expect(model.omitted).toBe(true)
  expect(model.head[0]).toBe('folder-0')
  expect(model.tail[model.tail.length - 1]).toBe('folder-99')
  expect(model.height).toBeLessThanOrEqual(270)
  expect(folderHudModel(['/project/trip/a', '/project/trip/b'], '/project', 600).header).toBe('')
})

test('thumb-aligned HUD stays inside viewport at both extremes', () => {
  for (const top of [0, 50000, 99400]) {
    const position = folderHudPosition(top, 100000, 600, 220)
    expect(position.top).toBeGreaterThanOrEqual(8)
    expect(position.top + 220).toBeLessThanOrEqual(592)
    expect(position.caret).toBeGreaterThanOrEqual(10)
    expect(position.caret).toBeLessThanOrEqual(210)
  }
})
