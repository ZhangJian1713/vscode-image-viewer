import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { spawnSync } from 'child_process'
import { ModuleKind, transpileModule } from 'typescript'
import { readImageDimensions } from './imageDimensions'

let root: string
beforeEach(() => { root = fs.mkdtempSync(path.join(os.tmpdir(), 'image-dimensions-')) })
afterEach(() => { fs.rmSync(root, { recursive: true, force: true }) })

test('reads dimensions from bounded headers without loading large image files', async () => {
  const png = path.join(root, 'large.png')
  fs.writeFileSync(png, Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aC1sAAAAASUVORK5CYII=', 'base64'))
  fs.truncateSync(png, 64 * 1024 * 1024)
  expect(await readImageDimensions(png)).toMatchObject({ width: 1, height: 1, type: 'png' })

  const svg = path.join(root, 'small.svg')
  fs.writeFileSync(svg, '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="20"/>')
  expect(await readImageDimensions(svg)).toMatchObject({ width: 40, height: 20, type: 'svg' })
})

test('missing, empty and unsupported inputs have unknown dimensions', async () => {
  expect(await readImageDimensions(path.join(root, 'missing.png'))).toBeNull()
  for (const [name, content] of [['empty.png', ''], ['corrupt.png', 'not an image']]) {
    const file = path.join(root, name)
    fs.writeFileSync(file, content)
    expect(await readImageDimensions(file)).toBeNull()
  }
  expect(await readImageDimensions(root)).toBeNull()
})

function box(type: string, payload: Buffer): Buffer {
  const header = Buffer.alloc(8)
  header.writeUInt32BE(8 + payload.length)
  header.write(type, 4)
  return Buffer.concat([header, payload])
}

// Exercise the nested parser loops as well as format detection.
const zeroSizeIspe = Buffer.alloc(20)
zeroSizeIspe.write('ispe', 4)
const nestedHeif = Buffer.concat([
  box('ftyp', Buffer.from('heicheic')),
  box('meta', Buffer.concat([Buffer.alloc(4), box('iprp', box('ipco', zeroSizeIspe))]))
])
const zeroSizeJxlp = Buffer.alloc(12)
zeroSizeJxlp.write('jxlp', 4)
const partialJxl = Buffer.concat([
  box('JXL ', Buffer.from([0x0d, 0x0a, 0x87, 0x0a])),
  box('ftyp', Buffer.from('jxl ')), zeroSizeJxlp
])
const malformedImages: Array<[string, Buffer]> = [
  ['ICNS', Buffer.from([0x69, 0x63, 0x6e, 0x73, 0x01, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0])],
  ['JXL header', Buffer.from([0, 0, 0, 0, 0x4a, 0x58, 0x4c, 0x20])],
  ['HEIF header', Buffer.from([0, 0, 0, 0, 0x66, 0x74, 0x79, 0x70, 0x61, 0x76, 0x69, 0x66])],
  ['HEIF nested ispe', nestedHeif],
  ['JXL partial stream', partialJxl]
]

test.each(malformedImages)('rejects malformed %s content even when named PNG, without hanging', (_format, bytes) => {
  const file = path.join(root, 'misleading.png')
  fs.writeFileSync(file, bytes)
  // Run the real helper in a killable process: a parser regression must not freeze Jest.
  const compiled = transpileModule(fs.readFileSync(path.join(__dirname, 'imageDimensions.ts'), 'utf8'), {
    compilerOptions: { module: ModuleKind.CommonJS }
  }).outputText
  const result = spawnSync(process.execPath, ['-e', `${compiled}
    exports.readImageDimensions(process.argv[1]).then(result => console.log(JSON.stringify(result)))`, file], {
    timeout: 2000,
    killSignal: 'SIGKILL',
    encoding: 'utf8',
    maxBuffer: 4096
  })
  expect(result.error).toBeUndefined()
  expect(result.status).toBe(0)
  expect(result.stderr).toBe('')
  expect(JSON.parse(result.stdout)).toBeNull()
})
