const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const os = require('os')
const path = require('path')
const crypto = require('crypto')
const { pipeline } = require('stream/promises')
const { parseArgs, loadPackages, publishPackages, checkPackages } = require('./publish.cjs')

const source = { name: 'viewer', publisher: 'test', version: '1.0.0', description: 'New viewer', keywords: ['image'], engines: { vscode: '^1.92.0' } }
function directory(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'image-viewer-publish-'))
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }))
  return dir
}
function info(t, target = 'darwin-arm64') {
  const filename = path.join(directory(t), `${target}.vsix`)
  const bytes = Buffer.from(target)
  fs.writeFileSync(filename, bytes)
  return { filename, target, manifest: source, size: bytes.length, sha256: crypto.createHash('sha256').update(bytes).digest('hex') }
}
async function fixture(dir, { description = source.description, target = 'darwin-arm64' } = {}) {
  const zip = new (require('yazl').ZipFile)()
  zip.addBuffer(Buffer.from(JSON.stringify({ ...source, description })), 'extension/package.json')
  zip.addBuffer(Buffer.from(`<PackageManifest><Metadata><Identity Publisher="test" Id="viewer" Version="1.0.0" TargetPlatform="${target}"/></Metadata></PackageManifest>`), 'extension.vsixmanifest')
  for (const file of ['dist/extension.js', 'dist/native/imageio.node', 'distWebview/index.html', 'distWebview/app.js', 'distWebview/single.html', 'distWebview/single.js']) zip.addBuffer(Buffer.from('fixture'), `extension/${file}`)
  const writing = pipeline(zip.outputStream, fs.createWriteStream(path.join(dir, 'viewer-1.0.0-darwin-arm64.vsix')))
  zip.end()
  await writing
}
function adapter(name, options = {}) {
  const uploaded = []
  return {
    name, uploaded,
    prepare: options.prepare || (async () => {}),
    existing: options.existing || (async (item) => uploaded.includes(item.target) ? { sha256: item.sha256, public: true } : null),
    publish: options.publish || (async (item) => { uploaded.push(item.target) })
  }
}
const quiet = () => {}

test('defaults to four macOS/Windows packages and rejects invalid or repeated options', () => {
  assert.deepEqual(parseArgs(['all']).targets, ['darwin-arm64', 'darwin-x64', 'win32-x64', 'win32-arm64'])
  assert.deepEqual(parseArgs(['vscode', '--dry-run', 'darwin-arm64']), { mode: 'vscode', dryRun: true, targets: ['darwin-arm64'] })
  assert.throws(() => parseArgs(['all', 'darwin-arm64', 'darwin-arm64']), /重复/)
  assert.throws(() => parseArgs(['all', '--unknown']), /Unsupported/)
})

test('inspects native package structure and refuses stale metadata or wrong platform before upload', async t => {
  const dir = directory(t)
  await fixture(dir)
  assert.equal((await loadPackages(['darwin-arm64'], source, true, dir))[0].target, 'darwin-arm64')
  await fixture(dir, { description: 'Old viewer' })
  await assert.rejects(loadPackages(['darwin-arm64'], source, true, dir), /过期/)
  assert.equal((await loadPackages(['darwin-arm64'], source, false, dir)).length, 1)
  await fixture(dir, { target: 'darwin-x64' })
  await assert.rejects(loadPackages(['darwin-arm64'], source, true, dir), /平台不一致/)
})

test('validates both registries credentials before any upload', async t => {
  const first = adapter('Marketplace')
  const second = adapter('Open VSX', { prepare: async () => { throw new Error('missing token') } })
  await assert.rejects(publishPackages([info(t)], [first, second], quiet), /missing token/)
  assert.deepEqual(first.uploaded, [])
})

test('checks all existing artifacts before uploading, and rejects a different published hash', async t => {
  const first = adapter('Marketplace')
  const second = adapter('Open VSX', { existing: async () => ({ sha256: 'different', public: true }) })
  await assert.rejects(publishPackages([info(t)], [first, second], quiet), /新版本号/)
  assert.deepEqual(first.uploaded, [])
})

test('resumes across registries by skipping only confirmed identical packages', async t => {
  const item = info(t)
  const first = adapter('Marketplace', { existing: async () => ({ sha256: item.sha256, public: true }) })
  const second = adapter('Open VSX')
  const result = await publishPackages([item], [first, second], quiet)
  assert.deepEqual(first.uploaded, [])
  assert.deepEqual(second.uploaded, [item.target])
  assert.ok(result.every(entry => entry.public))
})

test('accepted uploads awaiting activation do not block subsequent platform uploads', async t => {
  const registry = adapter('Open VSX', { existing: async () => null })
  const items = [info(t), info(t, 'darwin-x64')]
  const result = await publishPackages(items, [registry], quiet)
  assert.deepEqual(registry.uploaded, ['darwin-arm64', 'darwin-x64'])
  assert.ok(result.every(entry => !entry.public))
})

test('post-upload query failure reports pending instead of retrying a successful upload', async t => {
  let uploaded = 0
  const registry = adapter('Open VSX', {
    existing: async (_item, verifyHash) => { if (verifyHash) return null; throw new Error('network unavailable') },
    publish: async () => { uploaded++ }
  })
  const result = await publishPackages([info(t)], [registry], quiet)
  assert.equal(uploaded, 1)
  assert.equal(result[0].public, false)
})

test('stops if an artifact changes after inspection', async t => {
  const item = info(t)
  const registry = adapter('Marketplace', { existing: async () => { fs.writeFileSync(item.filename, 'modified'); return null } })
  await assert.rejects(publishPackages([item], [registry], quiet), /被修改/)
  assert.deepEqual(registry.uploaded, [])
})

test('status checks do not read credentials or publish and distinguish public from pending', async t => {
  const registry = adapter('Marketplace', {
    prepare: async () => { throw Error('must not read credentials') },
    existing: async () => ({ public: false })
  })
  assert.equal(await checkPackages([info(t)], [registry], quiet), false)
  assert.deepEqual(registry.uploaded, [])
})
