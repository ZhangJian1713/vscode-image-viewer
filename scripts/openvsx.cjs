/* Upload the exact VSIX inspected here; never rebuild or silently skip a duplicate. */
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const { createRequire } = require('module')
const ovsx = require('ovsx')
const zip = createRequire(require.resolve('ovsx/package.json'))('yauzl-promise')
const { parseStringPromise } = createRequire(require.resolve('@vscode/vsce/package.json'))('xml2js')
const root = path.resolve(__dirname, '..')
const registry = 'https://open-vsx.org'
const source = require(path.join(root, 'package.json'))
const { validateTarget, sharpPlatform } = require('./vsix-targets.cjs')
const [command, file, ...flags] = process.argv.slice(2)
const offline = flags.includes('--offline')
let token

function credentials() {
  const tokenFile = path.join(root, '.openvsx-token')
  const value = process.env.OVSX_PAT || (fs.existsSync(tokenFile) ? fs.readFileSync(tokenFile, 'utf8') : '')
  const result = value.trim()
  if (result && (/\s/.test(result) || result.length > 4096)) throw new Error('Token 应为单行原始值，请勿写成 OVSX_PAT=...。')
  if (result && !process.env.OVSX_PAT && process.platform !== 'win32') fs.chmodSync(tokenFile, 0o600)
  return result
}

async function inspect(filename, expectedSource = source) {
  const archive = await zip.open(filename)
  const entries = new Set(), metadata = new Map()
  const selected = new Set(['extension/package.json', 'extension.vsixmanifest', 'extension/dist/native/sharp-runtime/manifest.json'])
  try {
    for await (const entry of archive) {
      entries.add(entry.filename)
      if (/\/(?:\.openvsx-token|\.env(?:\.[^/]*)?)$/.test(entry.filename)) throw new Error('VSIX 包含凭据文件，拒绝上传。')
      if (selected.has(entry.filename)) {
        if (entry.uncompressedSize > 1024 * 1024) throw new Error('VSIX 元数据异常大。')
        const chunks = []
        for await (const chunk of await archive.openReadStream(entry)) chunks.push(chunk)
        metadata.set(entry.filename, Buffer.concat(chunks).toString('utf8'))
      }
    }
  } finally { await archive.close() }
  const manifest = JSON.parse(metadata.get('extension/package.json') || 'null')
  if (!manifest || manifest.publisher !== expectedSource.publisher || manifest.name !== expectedSource.name || manifest.version !== expectedSource.version) {
    throw new Error('VSIX 的 publisher/name/version 与当前项目不一致，请重新打包。')
  }
  const xml = await parseStringPromise(metadata.get('extension.vsixmanifest') || '')
  const identity = xml.PackageManifest.Metadata[0].Identity[0].$
  if (identity.Publisher !== manifest.publisher || identity.Id !== manifest.name || identity.Version !== manifest.version) throw new Error('VSIX 两份 manifest 的身份或版本不一致。')
  const target = identity.TargetPlatform || 'universal'
  validateTarget(target)
  for (const required of ['extension/dist/extension.js', 'extension/distWebview/index.html', 'extension/distWebview/app.js', 'extension/distWebview/single.html', 'extension/distWebview/single.js']) {
    if (!entries.has(required)) throw new Error(`缺少插件运行文件：${required}`)
  }
  if (target.startsWith('darwin-')) {
    if (!entries.has('extension/dist/native/imageio.node')) throw new Error('macOS/通用包缺少 ImageIO 模块，应在 macOS 上构建。')
    if ([...entries].some(name => name.startsWith('extension/dist/native/sharp-runtime/'))) throw new Error('macOS 包不应包含 Sharp。')
  }
  if (!target.startsWith('darwin-')) {
    if (entries.has('extension/dist/native/imageio.node')) throw new Error('Windows/Linux 包不应包含 ImageIO。')
    const runtime = JSON.parse(metadata.get('extension/dist/native/sharp-runtime/manifest.json') || 'null')
    const expected = [sharpPlatform(target)]
    if (!runtime || runtime.platforms.length !== 1 || runtime.platforms[0] !== expected[0]) throw new Error('Sharp 运行时必须只包含目标平台。')
    for (const name of entries) {
      const native = name.match(/\/node_modules\/@img\/(sharp(?:-libvips)?-[^/]+)\//)
      if (native && ![`sharp-${expected[0]}`, `sharp-libvips-${expected[0]}`].includes(native[1])) throw new Error('Sharp 包含其他平台原生文件。')
    }
    for (const platform of expected) {
      if (![...entries].some(name => name.startsWith(`extension/dist/native/sharp-runtime/node_modules/@img/sharp-${platform}/`) && name.endsWith('.node'))) throw new Error(`缺少 Sharp ${platform} 二进制。`)
      const libPrefix = `extension/dist/native/sharp-runtime/node_modules/@img/${platform.startsWith('win32-') ? 'sharp-' : 'sharp-libvips-'}${platform}/lib/`
      if (![...entries].some(name => name.startsWith(libPrefix) && /libvips-cpp.*\.(?:dll|dylib|so(?:\.[\d.]+)?)$/.test(name))) throw new Error(`缺少 libvips ${platform} 动态库。`)
    }
  }
  return { manifest, target, size: fs.statSync(filename).size, sha256: crypto.createHash('sha256').update(fs.readFileSync(filename)).digest('hex') }
}

async function remote(manifest, target) {
  const url = `${registry}/api/${[manifest.publisher, manifest.name, target, manifest.version].map(encodeURIComponent).join('/')}`
  const response = await fetch(url, { signal: AbortSignal.timeout(30000) })
  if (response.status === 404) return null
  if (!response.ok) throw new Error(`Open VSX 版本检查失败：HTTP ${response.status}`)
  const result = await response.json()
  if (result.error) throw new Error('Open VSX 返回版本查询错误。')
  if (result.version !== manifest.version || result.targetPlatform !== target) throw new Error('Open VSX 返回的版本或平台与查询不一致。')
  return result
}

async function main() {
  if (!['check', 'publish'].includes(command) || !file || flags.some(flag => flag !== '--offline') || (command === 'publish' && offline)) {
    throw new Error('用法：yarn openvsx:check FILE.vsix [--offline] 或 yarn openvsx:publish FILE.vsix')
  }
  const filename = path.resolve(file)
  const info = await inspect(filename)
  console.log(`包：${info.manifest.publisher}.${info.manifest.name} ${info.manifest.version}@${info.target}`)
  console.log(`文件：${filename}\n大小：${(info.size / 1024 / 1024).toFixed(2)} MiB\nSHA-256：${info.sha256}`)
  console.log('本地包检查通过。')
  if (offline) return
  const existing = await remote(info.manifest, info.target)
  console.log(existing ? '此版本/平台已经发布，无法覆盖。' : '此版本/平台尚未发布。')
  token = credentials()
  if (token) await ovsx.verifyPat({ namespace: info.manifest.publisher, registryUrl: registry, pat: token })
  else console.log('未配置 Token：请设置 OVSX_PAT，或保存到项目根目录 .openvsx-token。')
  if (command === 'check') return
  if (existing) throw new Error('拒绝重复发布，请先明确新的版本号。')
  if (!token) throw new Error('缺少 Open VSX Token，尚未上传。')
  const currentHash = crypto.createHash('sha256').update(fs.readFileSync(filename)).digest('hex')
  if (currentHash !== info.sha256) throw new Error('检查后 VSIX 被修改，拒绝上传。')
  const results = await ovsx.publish({ extensionFile: filename, registryUrl: registry, pat: token })
  const failures = results.filter(result => result.status === 'rejected')
  if (failures.length) throw failures[0].reason
  let published
  try { published = await remote(info.manifest, info.target) }
  catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.log(`上传成功，线上查询暂不可用：${message.split(token).join('[REDACTED]')}。请稍后核对，不要重复上传。`)
    return
  }
  if (!published) {
    console.log('上传成功，Open VSX 尚在异步处理。请稍后查询公开状态，不要重复上传。')
    return
  }
  console.log(`已核对线上版本：${registry}/extension/${info.manifest.publisher}/${info.manifest.name}`)
}

if (require.main === module) main().catch(error => {
  const message = error instanceof Error ? error.message : String(error)
  console.error(token ? message.split(token).join('[REDACTED]') : message)
  process.exitCode = 1
})

module.exports = { inspect, remote, credentials }
