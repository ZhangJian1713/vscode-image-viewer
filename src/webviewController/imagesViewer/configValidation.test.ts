import { validateConfig } from './configValidation'

test('preserves all current settings and drops unknown and host-only fields', () => {
  expect(validateConfig({ galleryLayout: 'fill', gallerySidebarWidth: 230, galleryListThumbSize: 64,
    imageGridColumns: 20, galleryShowFileSize: false, uiTheme: 'dark', includeFolders: ['photos/**'],
    hostUiLanguage: 'zh-CN', unexpected: 'value' })).toEqual({ galleryLayout: 'fill', gallerySidebarWidth: 230,
    galleryListThumbSize: 64, imageGridColumns: 20, galleryShowFileSize: false, uiTheme: 'dark', includeFolders: ['photos/**'] })
})
test('rejects malformed and traversal-bearing configuration before it can be saved', () => {
  for (const value of [null, [], { includeFolders: ['../outside'] }, { excludeFolders: ['C:\\outside'] },
    { imageGridColumns: Infinity }, { gallerySidebarWidth: 'wide' }, { showImageTypes: ['.json'] },
    { galleryCompact: 'yes' }, { galleryLayout: 'unknown' }, { includeFolders: new Array(65).fill('x') }]) {
    expect(() => validateConfig(value)).toThrow()
  }
})
test('reading old config recovers valid settings without allowing invalid scan rules', () => {
  expect(validateConfig({ galleryLayout: 'list', includeFolders: ['../outside'], keyword: 'photo' }, false))
    .toEqual({ galleryLayout: 'list', keyword: 'photo' })
})
