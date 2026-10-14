import * as path from 'path'
import { createRequire } from 'module'

/* eslint-disable no-unused-vars -- runtime API signatures */
interface SharpRuntime {
  cache: (enabled: false) => void
  concurrency: (threads: number) => number
}
interface SharpPipelineModule {
  generateThumbnail: (sharp: SharpRuntime, source: string, edge: number, quality: number) => Promise<Buffer>
}
/* eslint-enable no-unused-vars */
let runtime: { sharp: SharpRuntime; pipeline: SharpPipelineModule } | undefined

export async function sharpThumbnail(extensionRoot: string, source: string, edge: number, quality: number): Promise<Buffer> {
  if (!runtime) {
    const nativeRequire = createRequire(path.join(extensionRoot, 'dist/native/sharp-runtime/index.cjs'))
    const sharp = nativeRequire('sharp') as SharpRuntime
    // 图库已有磁盘缓存；不在 libvips 中额外保留原图/操作结果，也不让每张图再开满全部核心。
    sharp.cache(false)
    sharp.concurrency(1)
    runtime = { sharp, pipeline: nativeRequire('./thumbnail.cjs') as SharpPipelineModule }
  }
  return runtime.pipeline.generateThumbnail(runtime.sharp, source, edge, quality)
}
