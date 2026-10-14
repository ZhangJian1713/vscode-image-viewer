import { nextAdaptiveZoom } from './adaptiveZoom'

test.each([[25, 50], [14, 35], [40, 65]])('large image Fit %s%% cycles through meaningful Detail %s%%', (fit, detail) => {
  expect(nextAdaptiveZoom({ mode: 'fit', nativePercent: 10, fitEquivalentNativePercent: fit })).toEqual({ mode: 'native', percent: detail })
  expect(nextAdaptiveZoom({ mode: 'native', nativePercent: detail, fitEquivalentNativePercent: fit })).toEqual({ mode: 'native', percent: 100 })
  expect(nextAdaptiveZoom({ mode: 'native', nativePercent: 100, fitEquivalentNativePercent: fit })).toEqual({ mode: 'fit' })
})

test('near-actual Fit has two states; small images use 200% rather than an invisible Fit/100% transition', () => {
  expect(nextAdaptiveZoom({ mode: 'fit', nativePercent: 10, fitEquivalentNativePercent: 74 })).toEqual({ mode: 'native', percent: 100 })
  for (const mode of ['fit', 'native'] as const) {
    expect(nextAdaptiveZoom({ mode, nativePercent: 100, fitEquivalentNativePercent: 100 })).toEqual({ mode: 'native', percent: 200 })
  }
  expect(nextAdaptiveZoom({ mode: 'native', nativePercent: 200, fitEquivalentNativePercent: 100 })).toEqual({ mode: 'fit' })
  expect(nextAdaptiveZoom({ mode: 'native', nativePercent: 150, fitEquivalentNativePercent: 100 })).toEqual({ mode: 'fit' })
})

test('arbitrary wheel/toolbar scale returns to Fit and missing dimensions do not invent Detail', () => {
  expect(nextAdaptiveZoom({ mode: 'native', nativePercent: 800, fitEquivalentNativePercent: 25 })).toEqual({ mode: 'fit' })
  expect(nextAdaptiveZoom({ mode: 'fit', nativePercent: 10 })).toEqual({ mode: 'native', percent: 100 })
})
