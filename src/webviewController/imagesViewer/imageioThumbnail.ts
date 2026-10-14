import * as path from 'path'
import { createRequire } from 'module'

/* eslint-disable no-unused-vars -- typed native callback signature */
interface ImageIOBinding {
  generateThumbnail: (source: string, edge: number, quality: number) => Promise<Buffer>
}
/* eslint-enable no-unused-vars */
let binding: ImageIOBinding | undefined

export async function imageioThumbnail(extensionRoot: string, source: string, edge: number, quality: number): Promise<Buffer> {
  if (!binding) {
    // Node loads the binary at runtime; Webpack must not turn it into a module context.
    const nativeRequire = createRequire(path.join(extensionRoot, 'dist/extension.js'))
    binding = nativeRequire(path.join(extensionRoot, 'dist/native/imageio.node')) as ImageIOBinding
    if (typeof binding.generateThumbnail !== 'function') {
      binding = undefined
      throw new Error('ImageIO native module does not expose generateThumbnail')
    }
  }
  return binding.generateThumbnail(source, edge, quality)
}
