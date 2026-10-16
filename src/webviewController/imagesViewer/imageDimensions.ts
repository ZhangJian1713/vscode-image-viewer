import * as fs from 'fs'
import { imageSize } from 'image-size'

const MAX_HEADER_BYTES = 512 * 1024

/** Bound disk reads and memory use; the parser only needs the image header. */
export async function readImageDimensions(filePath: string): Promise<ReturnType<typeof imageSize> | null> {
  try {
    const file = await fs.promises.open(filePath, 'r')
    try {
      const stat = await file.stat()
      if (!stat.isFile()) { return null }
      const header = Buffer.alloc(Math.min(stat.size, MAX_HEADER_BYTES))
      const { bytesRead } = await file.read(header, 0, header.length, 0)
      return imageSize(header.subarray(0, bytesRead))
    } finally {
      await file.close()
    }
  } catch {
    // Missing, unsupported or corrupt files have unknown dimensions.
    return null
  }
}
