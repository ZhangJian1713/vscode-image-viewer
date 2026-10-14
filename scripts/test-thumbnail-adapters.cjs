/* Native modules run in a real Node environment rather than Jest's emulated module loader. */
const fs = require('fs/promises')
const path = require('path')
const os = require('os')
const assert = require('assert').strict
const Jimp = require('jimp')
const ts = require('typescript')
const root = path.resolve(__dirname, '..')

async function main() {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'thumbnail-adapters-'))
  try {
    const source = path.join(directory, 'source.png')
    await new Jimp(600, 400, 0x336699ff).writeAsync(source)
    const names = process.platform === 'darwin' ? ['imageioThumbnail'] : ['sharpThumbnail']
    for (const name of names) {
      const input = await fs.readFile(path.join(root, 'src/webviewController/imagesViewer', `${name}.ts`), 'utf8')
      const code = ts.transpileModule(input, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2017 } }).outputText
      const compiled = path.join(directory, `${name}.cjs`)
      await fs.writeFile(compiled, code)
      const generate = require(compiled)[name]
      const bytes = await generate(root, source, 200, 78)
      assert.ok(Buffer.isBuffer(bytes))
      assert.equal(bytes[0], 0xff)
      assert.equal(bytes[1], 0xd8)
      const decoded = await Jimp.read(bytes)
      assert.equal(decoded.bitmap.width, 200)
      assert.ok(decoded.bitmap.height >= 132 && decoded.bitmap.height <= 134)
    }
    console.log(`Real adapters passed: ${names.join(', ')} with packaged runtime paths.`)
  } finally {
    await fs.rm(directory, { recursive: true, force: true })
  }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
