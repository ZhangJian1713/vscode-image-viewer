const assert = require('assert').strict
const fs = require('fs/promises')
const path = require('path')
const os = require('os')
const { createRequire } = require('module')
const Jimp = require('jimp')
const runtime = path.resolve(process.env.IMAGE_VIEWER_SHARP_RUNTIME || 'native/build/sharp-runtime')
const runtimeRequire = createRequire(path.join(runtime, 'index.cjs'))
const sharp = runtimeRequire('sharp')
const { generateThumbnail } = runtimeRequire('./thumbnail.cjs')
sharp.cache(false)
sharp.concurrency(1)

async function main() {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'sharp-thumbnail-check-'))
  try {
    const jpeg = path.join(directory, '源图片 with spaces.jpg')
    const alpha = path.join(directory, 'alpha.png')
    const webp = path.join(directory, 'source.webp')
    const tiff = path.join(directory, 'source.tiff')
    const rotated = path.join(directory, 'orientation-6.jpg')
    await new Jimp(1200, 800, 0x336699ff).writeAsync(jpeg)
    await new Jimp(400, 240, 0x00000000).writeAsync(alpha)
    await sharp(jpeg).webp().toFile(webp)
    await sharp(jpeg).tiff().toFile(tiff)
    await sharp(jpeg).withMetadata({ orientation: 6 }).toFile(rotated)
    for (const file of [jpeg, alpha, webp, tiff]) {
      for (const edge of [100, 200, 400, 800, 1600]) {
        const output = await generateThumbnail(sharp, file, edge, 78)
        const metadata = await sharp(output).metadata()
        assert.equal(metadata.format, 'jpeg')
        assert.ok(metadata.width > 0 && metadata.height > 0 && Math.max(metadata.width, metadata.height) <= edge)
        if (file === jpeg && edge === 1600) assert.equal(metadata.width, 1200)
      }
    }
    const direction = await sharp(await generateThumbnail(sharp, rotated, 200, 78)).metadata()
    assert.equal(direction.height, 200)
    assert.ok(direction.width >= 132 && direction.width <= 134)
    const transparent = await Jimp.read(await generateThumbnail(sharp, alpha, 200, 78))
    const pixel = Jimp.intToRGBA(transparent.getPixelColor(0, 0))
    assert.ok(pixel.r > 245 && pixel.g > 245 && pixel.b > 245)
    const invalid = path.join(directory, 'invalid.jpg')
    await fs.writeFile(invalid, Buffer.alloc(128 * 1024))
    await assert.rejects(generateThumbnail(sharp, invalid, 200, 78))
    await assert.rejects(generateThumbnail(sharp, path.join(directory, 'missing.jpg'), 200, 78))
    const batch = await Promise.all(Array.from({ length: 16 }, () => generateThumbnail(sharp, jpeg, 400, 78)))
    assert.ok(batch.every(bytes => bytes.equals(batch[0])))
    assert.equal(sharp.versions.sharp, '0.35.5')
    console.log('Packaged Sharp passed: JPEG/PNG/WebP/TIFF, tiers, EXIF, alpha, no upscaling, failures, async batch.')
  } finally {
    await fs.rm(directory, { recursive: true, force: true })
  }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
