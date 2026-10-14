import { thumbnailBackend } from '../../config/thumbnailBackend'

test('Windows and Linux select Sharp, while macOS retains ImageIO', () => {
  expect(thumbnailBackend('win32')).toBe('sharp')
  expect(thumbnailBackend('linux')).toBe('sharp')
  expect(thumbnailBackend('darwin')).toBe('imageio')
})
