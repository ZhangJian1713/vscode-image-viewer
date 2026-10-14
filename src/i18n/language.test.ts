import { effectiveLanguage, isLanguagePreference, resolveLanguage } from './language'
import { en } from './en'
import { zhCN } from './zh-CN'
import { zhTW } from './zh-TW'
import { createTranslator, fixedTranslate } from './translator'

test.each([
  ['en', 'en'], ['en-US', 'en'], ['en-GB', 'en'], ['zh', 'zh-CN'], ['zh-CN', 'zh-CN'],
  ['zh-SG', 'zh-CN'], ['zh-Hans', 'zh-CN'], ['zh-TW', 'zh-TW'], ['zh-HK', 'zh-TW'],
  ['zh-MO', 'zh-TW'], ['zh-Hant', 'zh-TW'], ['zh-Hant-CN', 'zh-TW'], ['zh-Hans-HK', 'zh-CN'],
  [' ZH_hant_TW ', 'zh-TW'], ['ja', 'en'], ['fr-FR', 'en'], ['de', 'en'], ['', 'en'],
  ['not a locale', 'en'], ['zh--TW', 'en'], [undefined, 'en'], [null, 'en']
])('editor locale %s resolves to %s', (input, expected) => {
  expect(resolveLanguage(input)).toBe(expected)
})

test('an explicit choice overrides the editor; auto with no supported locale uses English', () => {
  expect(effectiveLanguage('auto', 'ja')).toBe('en')
  expect(effectiveLanguage('auto', 'zh-TW')).toBe('zh-TW')
  expect(effectiveLanguage('en', 'zh-TW')).toBe('en')
  expect(effectiveLanguage('zh-CN', 'en')).toBe('zh-CN')
  expect(isLanguagePreference('system')).toBe(false)
  expect(isLanguagePreference('zh-HK')).toBe(false)
})

test('all shipped catalogs have identical nonempty keys and interpolation parameters', () => {
  const params = (text: string) => (text.match(/\{\{\s*\w+/g) || []).map((match) => match.replace(/\{\{\s*/, '')).sort()
  for (const catalog of [zhCN, zhTW]) {
    expect(Object.keys(catalog).sort()).toEqual(Object.keys(en).sort())
    for (const key of Object.keys(en) as Array<keyof typeof en>) {
      expect(catalog[key].trim()).not.toBe('')
      expect(params(catalog[key])).toEqual(params(en[key]))
    }
  }
})

test('bundled resources work offline with singular/plural counts and Chinese script distinctions', async () => {
  const instance = createTranslator('en')
  const english = fixedTranslate(instance, 'en')
  expect(english('gallery.images', { count: 1, value: '1' })).toBe('1 image')
  expect(english('gallery.images', { count: 2, value: '2' })).toBe('2 images')
  await instance.changeLanguage('zh-CN')
  expect(instance.t('language.label')).toBe('语言')
  await instance.changeLanguage('zh-TW')
  expect(instance.t('language.label')).toBe('語言')
  expect(instance.t('gallery.images', { count: 2, value: '2' })).toBe('2 張圖片')
})

test('manifest translations resolve every command and setting placeholder in all shipped languages', () => {
  const manifest = require('../../package.json')
  const placeholders = JSON.stringify(manifest.contributes).match(/%[^%]+%/g) || []
  const catalogs = [require('../../package.nls.json'), require('../../package.nls.zh-cn.json'), require('../../package.nls.zh-tw.json')]
  for (const catalog of catalogs) {
    for (const placeholder of placeholders) {
      expect(catalog[placeholder.slice(1, -1)]).toEqual(expect.any(String))
    }
  }
})
