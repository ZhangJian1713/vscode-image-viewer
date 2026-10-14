/* Functional smoke checks for the real module; intentionally no backend benchmark. */
const assert = require('assert').strict
const fs = require('fs/promises')
const os = require('os')
const path = require('path')
const Jimp = require('jimp')
const { Worker } = require('worker_threads')

if (process.platform !== 'darwin') {
  console.log('ImageIO smoke checks skipped: macOS required.')
  process.exit(0)
}
const modulePath = path.resolve(process.env.IMAGE_VIEWER_IMAGEIO_MODULE || 'native/build/imageio.node')
const { generateThumbnail } = require(modulePath)

function orientedJpeg(jpeg) {
  const tiff = Buffer.alloc(26)
  tiff.write('II')
  tiff.writeUInt16LE(42, 2)
  tiff.writeUInt32LE(8, 4)
  tiff.writeUInt16LE(1, 8)
  tiff.writeUInt16LE(0x0112, 10)
  tiff.writeUInt16LE(3, 12)
  tiff.writeUInt32LE(1, 14)
  tiff.writeUInt16LE(6, 18)
  const data = Buffer.concat([Buffer.from('Exif\0\0'), tiff])
  const marker = Buffer.from([0xff, 0xe1, 0, 0])
  marker.writeUInt16BE(data.length + 2, 2)
  return Buffer.concat([jpeg.subarray(0, 2), marker, data, jpeg.subarray(2)])
}

function tinyTiff() {
  const tags = [[256, 4, 1, 3], [257, 4, 1, 2], [258, 3, 3, 134], [259, 3, 1, 1],
    [262, 3, 1, 2], [273, 4, 1, 140], [277, 3, 1, 3], [278, 4, 1, 2], [279, 4, 1, 18], [284, 3, 1, 1]]
  const bytes = Buffer.alloc(158)
  bytes.write('II')
  bytes.writeUInt16LE(42, 2)
  bytes.writeUInt32LE(8, 4)
  bytes.writeUInt16LE(tags.length, 8)
  tags.forEach(([tag, type, count, value], index) => {
    const offset = 10 + index * 12
    bytes.writeUInt16LE(tag, offset)
    bytes.writeUInt16LE(type, offset + 2)
    bytes.writeUInt32LE(count, offset + 4)
    bytes.writeUInt32LE(value, offset + 8)
  })
  for (let index = 0; index < 3; index++) bytes.writeUInt16LE(8, 134 + index * 2)
  for (let index = 0; index < 6; index++) bytes[140 + index * 3] = 255
  return bytes
}

async function main() {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'imageio-check-'))
  try {
    const source = new Jimp(1200, 800, 0x336699ff)
    const jpeg = await source.quality(90).getBufferAsync(Jimp.MIME_JPEG)
    const file = path.join(directory, '源图片 with spaces.jpg')
    const rotated = path.join(directory, 'orientation-6.jpg')
    const png = path.join(directory, 'alpha.png')
    const bmp = path.join(directory, 'source.bmp')
    const gif = path.join(directory, 'first-frame.gif')
    const tiff = path.join(directory, 'source.tiff')
    await fs.writeFile(file, jpeg)
    await fs.writeFile(rotated, orientedJpeg(jpeg))
    const transparent = new Jimp(400, 240, 0x00000000)
    transparent.composite(new Jimp(100, 100, 0xff0000ff), 150, 70)
    await transparent.writeAsync(png)
    await source.writeAsync(bmp)
    await fs.writeFile(gif, Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64'))
    await fs.writeFile(tiff, tinyTiff())
    for (const edge of [100, 200, 400, 800, 1600]) {
      const output = await generateThumbnail(file, edge, 78)
      assert.equal(output[0], 0xff)
      assert.equal(output[1], 0xd8)
      const decoded = await Jimp.read(output)
      assert.equal(decoded.bitmap.width, Math.min(edge, 1200))
      assert.ok(decoded.bitmap.height > 0 && decoded.bitmap.height <= Math.min(edge, 800))
    }
    const oriented = await Jimp.read(await generateThumbnail(rotated, 200, 78))
    assert.equal(oriented.bitmap.height, 200)
    assert.ok(oriented.bitmap.width >= 132 && oriented.bitmap.width <= 134)
    const alpha = await Jimp.read(await generateThumbnail(png, 200, 78))
    const corner = Jimp.intToRGBA(alpha.getPixelColor(0, 0))
    assert.ok(corner.r > 245 && corner.g > 245 && corner.b > 245, 'JPEG alpha should be white')
    const bitmap = await Jimp.read(await generateThumbnail(bmp, 200, 78))
    assert.equal(bitmap.bitmap.width, 200)
    const gifImage = await Jimp.read(await generateThumbnail(gif, 200, 78))
    assert.equal(gifImage.bitmap.width, 1)
    const tiffImage = await Jimp.read(await generateThumbnail(tiff, 200, 78))
    assert.equal(tiffImage.bitmap.width, 3)
    assert.equal(tiffImage.bitmap.height, 2)

    assert.throws(() => generateThumbnail(file, 0, 78), TypeError)
    assert.throws(() => generateThumbnail(file, 1601, 78), TypeError)
    assert.throws(() => generateThumbnail(file, 100.5, 78), TypeError)
    assert.throws(() => generateThumbnail(file, 100, NaN), TypeError)
    assert.throws(() => generateThumbnail('relative.jpg', 100, 78), TypeError)
    assert.throws(() => generateThumbnail(`${file}\0bad`, 100, 78), TypeError)
    await assert.rejects(generateThumbnail(path.join(directory, 'missing.jpg'), 200, 78))
    const invalid = path.join(directory, 'invalid.jpg')
    await fs.writeFile(invalid, Buffer.alloc(128 * 1024))
    await assert.rejects(generateThumbnail(invalid, 200, 78))

    // Jobs share the worker pool without blocking the JS event loop or sharing image handles.
    let heartbeat = 0
    const timer = setInterval(() => heartbeat++, 1)
    try {
      const outputs = await Promise.all(Array.from({ length: 32 }, () => generateThumbnail(file, 800, 78)))
      assert.ok(outputs.every((bytes) => bytes.equals(outputs[0])))
      assert.ok(heartbeat > 0, 'native work must yield to the JS event loop')
    } finally {
      clearInterval(timer)
    }
    await new Promise((resolve, reject) => {
      const worker = new Worker(`
        const { parentPort, workerData } = require('worker_threads');
        require(workerData.modulePath).generateThumbnail(workerData.file, 200, 78)
          .then(bytes => parentPort.postMessage(bytes.length), error => { throw error; });
      `, { eval: true, workerData: { modulePath, file } })
      worker.once('error', reject)
      worker.once('message', (length) => assert.ok(length > 0))
      worker.once('exit', (code) => code === 0 ? resolve() : reject(new Error(`Worker exit ${code}`)))
    })
    console.log('ImageIO passed: tiers, no upscaling, EXIF, alpha, BMP/GIF/TIFF, invalid input, 32 async jobs, Worker loading.')
  } finally {
    await fs.rm(directory, { recursive: true, force: true })
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1 })
