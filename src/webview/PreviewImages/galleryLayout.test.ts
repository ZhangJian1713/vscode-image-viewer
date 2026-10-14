import { galleryGeometry, galleryWindow, galleryScrollHeight, galleryLogicalScrollTop, galleryPhysicalScrollTop } from './galleryLayout'

test('the virtual window stays bounded for a hundred thousand images and many small folders', () => {
  const geometry = galleryGeometry(100_000, 1200, 8, 'grid', false)
  for (const top of [0, 20_000, geometry.totalHeight - 700]) {
    const window = galleryWindow(geometry, top, 700)
    expect(window.end - window.start).toBeLessThan(12)
    expect(window.start).toBeGreaterThanOrEqual(0)
    expect(window.end).toBeLessThanOrEqual(geometry.rowCount)
  }
})

test('offscreen and empty ranges never generate invalid rows', () => {
  const geometry = galleryGeometry(80, 900, 8, 'fill', false)
  expect(galleryWindow(geometry, geometry.totalHeight + 10_000, 600)).toEqual({
    start: geometry.rowCount,
    end: geometry.rowCount
  })
  expect(galleryWindow(galleryGeometry(0, 900, 8, 'grid', false), 0, 600)).toEqual({ start: 0, end: 0 })
})

test('Fill and Grid share geometry and compact removes gaps and metadata without changing count', () => {
  expect(galleryGeometry(100, 1000, 6, 'grid', false)).toEqual(galleryGeometry(100, 1000, 6, 'fill', false))
  const compact = galleryGeometry(100, 1000, 6, 'fill', true)
  expect(compact.gap).toBe(0)
  expect(compact.padding).toBe(0)
  expect(compact.captionHeight).toBe(0)
  expect(compact.rowCount).toBe(17)
})

test('List uses one item per row and has no trailing phantom gap', () => {
  const list = galleryGeometry(100, 1000, 20, 'list', false, 64)
  expect(list.columns).toBe(1)
  expect(list.totalHeight).toBe(100 * 80 + 24)
  const window = galleryWindow(list, list.totalHeight - 400, 400)
  expect(window.end).toBe(100)
})

test('column limits and rendered pixel sizes remain consistent in narrow and wide walls', () => {
  expect(galleryGeometry(100_000, 1200, 50, 'grid', false).columns).toBe(20)
  expect(galleryGeometry(100_000, 1200, 0, 'fill', false).columns).toBe(1)
  const small = galleryGeometry(100_000, 1200, 20, 'grid', false)
  const large = galleryGeometry(100_000, 1200, 1, 'grid', false)
  expect(large.imageEdge).toBeGreaterThan(small.imageEdge)
  expect(small.imageEdge * small.columns + small.gap * (small.columns - 1) + small.padding * 2).toBe(1200)
  const narrow = galleryGeometry(100_000, 200, 20, 'grid', false)
  expect(narrow.columns).toBeLessThanOrEqual(20)
  expect(narrow.imageEdge).toBeGreaterThanOrEqual(1)
})

test('one-column 100k gallery reaches its final row despite browser CSS height limits', () => {
  const geometry = galleryGeometry(100_000, 1200, 1, 'grid', false)
  const height = 700
  expect(galleryScrollHeight(geometry.totalHeight)).toBe(8_000_000)
  const bottom = galleryLogicalScrollTop(8_000_000 - height, geometry.totalHeight, height)
  expect(bottom).toBe(geometry.totalHeight - height)
  expect(galleryWindow(geometry, bottom, height).end).toBe(100_000)
  for (const fraction of [0, 0.1, 0.5, 1]) {
    const logical = (geometry.totalHeight - height) * fraction
    expect(galleryLogicalScrollTop(galleryPhysicalScrollTop(logical, geometry.totalHeight, height), geometry.totalHeight, height)).toBeCloseTo(logical, 5)
  }
  expect(galleryLogicalScrollTop(500, 10_000, height)).toBe(500)
})

test('hover-only file sizes reduce normal captions without changing List or compact geometry', () => {
  const caption = galleryGeometry(100_000, 1000, 8, 'grid', false, 64, true)
  const hover = galleryGeometry(100_000, 1000, 8, 'grid', false, 64, false)
  expect(hover.captionHeight).toBe(26)
  expect(caption.rowHeight - hover.rowHeight).toBe(14)
  expect(hover.rowCount).toBe(caption.rowCount)
  for (const mode of ['fill', 'grid', 'list'] as const) {
    const geometry = galleryGeometry(100_000, 1000, 8, mode, false, 64, false)
    const range = galleryWindow(geometry, geometry.totalHeight / 2, 600)
    expect((range.end - range.start) * geometry.columns).toBeLessThan(100)
  }
  expect(galleryGeometry(100, 1000, 8, 'list', false, 64, false)).toEqual(
    galleryGeometry(100, 1000, 8, 'list', false, 64, true)
  )
  expect(galleryGeometry(100, 1000, 8, 'fill', true, 64, false)).toEqual(
    galleryGeometry(100, 1000, 8, 'fill', true, 64, true)
  )
})
