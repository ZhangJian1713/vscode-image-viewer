/* Publish inspected artifacts to either registry or both; never build or bump versions here. */
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const { inspect, remote: openVsxRemote, credentials: openVsxCredentials } = require('./openvsx.cjs')
const { releaseTargets, validateTarget } = require('./vsix-targets.cjs')
const root = path.resolve(__dirname, '..')
const secrets = []

function parseArgs(args) {
  const [mode, ...rest] = args
  if (!['vscode', 'openvsx', 'all', 'check'].includes(mode)) throw new Error('用法：node scripts/publish.cjs vscode|openvsx|all|check [--dry-run] [平台...]')
  const dryRun = rest.includes('--dry-run')
  if (mode === 'check' && dryRun) throw new Error('check 本身只读，不使用 --dry-run。')
  const requested = rest.filter(arg => arg !== '--dry-run')
  const targets = requested.length ? requested.map(validateTarget) : releaseTargets
  if (new Set(targets).size !== targets.length) throw new Error('平台参数重复。')
  return { mode, dryRun, targets }
}

async function loadPackages(targets, source, checkMetadata = true, directory = root) {
  const infos = []
  for (const target of targets) {
    const filename = path.join(directory, `${source.name}-${source.version}-${target}.vsix`)
    if (!fs.existsSync(filename)) throw new Error(`缺少 ${path.basename(filename)}，请先运行 yarn vsix:release。`)
    const info = await inspect(filename, source)
    if (info.target !== target) throw new Error(`文件名与包内平台不一致：${path.basename(filename)}`)
    if (checkMetadata && ['description', 'keywords', 'engines'].some(key => JSON.stringify(info.manifest[key]) !== JSON.stringify(source[key]))) {
      throw new Error(`${path.basename(filename)} 的简介、关键词或兼容要求已过期，请重新打包。`)
    }
    infos.push({ ...info, filename })
  }
  return infos
}

function assertUnchanged(info) {
  const hash = crypto.createHash('sha256').update(fs.readFileSync(info.filename)).digest('hex')
  if (hash !== info.sha256) throw new Error(`检查后 VSIX 被修改：${path.basename(info.filename)}，停止上传。`)
}

function redact(message) {
  return secrets.reduce((text, secret) => text.split(secret).join('[REDACTED]'), String(message))
}

async function marketplaceCredentials(publisher) {
  const { FileStore, KeytarStore } = require('@vscode/vsce/out/store')
  let token = process.env.VSCE_PAT
  if (!token && !/^file$/i.test(process.env.VSCE_STORE || '')) {
    try { token = (await KeytarStore.open()).get(publisher)?.pat } catch { /* Try the file store. */ }
  }
  if (!token) token = (await FileStore.open()).get(publisher)?.pat
  if (!token) throw new Error(`缺少 Marketplace 凭据：运行 npx vsce login ${publisher}，或设置 VSCE_PAT。`)
  secrets.push(token)
  return token
}

function marketplaceAdapter(source, readOnly) {
  const { getGalleryAPI, getPublicGalleryAPI } = require('@vscode/vsce/out/util')
  const { ExtensionQueryFlags } = require('azure-devops-node-api/interfaces/GalleryInterfaces')
  let api, token, cached
  return {
    name: 'VS Code Marketplace',
    async prepare() {
      token = await marketplaceCredentials(source.publisher)
      await require('@vscode/vsce/out/store').verifyPat({ publisherName: source.publisher, pat: token })
      api = await getGalleryAPI(token)
    },
    async existing(info) {
      if (!cached) cached = (async () => {
        if (readOnly) return getPublicGalleryAPI().getExtension(`${source.publisher}.${source.name}`, [ExtensionQueryFlags.IncludeVersions, ExtensionQueryFlags.IncludeVersionProperties])
        try { return await api.getExtension(null, source.publisher, source.name, undefined, ExtensionQueryFlags.IncludeVersions | ExtensionQueryFlags.IncludeVersionProperties) }
        catch (error) { if (error.statusCode === 404) return null; throw error }
      })()
      const extension = await cached
      const version = extension?.versions?.find(v => v.version === info.manifest.version && v.targetPlatform === info.target)
      if (!version) return null
      return { public: Boolean(version.flags & 1), sha256: version.properties?.find(p => p.key === 'Microsoft.VisualStudio.Services.VsixSha256')?.value }
    },
    async publish(info) {
      await require('@vscode/vsce').publishVSIX(info.filename, { pat: token })
      cached = null
    }
  }
}

async function downloadHash(url, expectedSize) {
  const response = await fetch(url, { signal: AbortSignal.timeout(60000) })
  if (!response.ok || !response.body) throw new Error(`Open VSX 下载校验失败：HTTP ${response.status}`)
  let size = 0
  const hash = crypto.createHash('sha256')
  for await (const chunk of response.body) {
    size += chunk.length
    if (size > expectedSize) throw new Error('线上包大小与本地不同，拒绝跳过。')
    hash.update(chunk)
  }
  return hash.digest('hex')
}

function openVsxAdapter(source) {
  let token
  return {
    name: 'Open VSX',
    async prepare() {
      token = openVsxCredentials()
      if (!token) throw new Error('缺少 Open VSX Token：设置 OVSX_PAT 或保存到 .openvsx-token。')
      secrets.push(token)
      await require('ovsx').verifyPat({ namespace: source.publisher, registryUrl: 'https://open-vsx.org', pat: token })
    },
    async existing(info, verifyHash = false) {
      const version = await openVsxRemote(info.manifest, info.target)
      if (!version) return null
      return { public: true, sha256: verifyHash ? await downloadHash(version.files.download, info.size) : undefined }
    },
    async publish(info) {
      const results = await require('ovsx').publish({ extensionFile: info.filename, registryUrl: 'https://open-vsx.org', pat: token })
      const failure = results.find(result => result.status === 'rejected')
      if (failure) throw failure.reason
    }
  }
}

async function publishPackages(infos, adapters, log = console.log) {
  // Check every credential and existing package before the first irreversible upload.
  for (const adapter of adapters) await adapter.prepare()
  const plan = []
  for (const adapter of adapters) {
    for (const info of infos) {
      const existing = await adapter.existing(info, true)
      if (existing && existing.sha256 !== info.sha256) {
        throw new Error(`${adapter.name} 已有 ${info.manifest.version}@${info.target}，但无法确认与本地包一致。请使用新版本号。`)
      }
      plan.push({ adapter, info, existing })
    }
  }
  const results = []
  for (const { adapter, info, existing } of plan) {
    assertUnchanged(info)
    if (existing) {
      log(`${adapter.name} ${info.target}：相同包已上传，跳过${existing.public ? '（已公开）' : '（处理中）'}。`)
      results.push({ registry: adapter.name, target: info.target, public: existing.public })
      continue
    }
    await adapter.publish(info)
    let published
    try { published = await adapter.existing(info, false) }
    catch (error) { log(`${adapter.name} ${info.target}：上传成功，线上查询暂不可用：${redact(error.message)}`) }
    const visible = Boolean(published?.public)
    log(`${adapter.name} ${info.target}：${visible ? '已公开' : '上传成功，等待市场处理；不要重复上传'}。`)
    results.push({ registry: adapter.name, target: info.target, public: visible })
  }
  return results
}

async function checkPackages(infos, adapters, log = console.log) {
  let ready = true
  for (const adapter of adapters) {
    for (const info of infos) {
      const version = await adapter.existing(info, false)
      const visible = Boolean(version?.public)
      log(`${adapter.name} ${info.manifest.version}@${info.target}：${visible ? '已公开' : '尚未公开'}。`)
      ready = ready && visible
    }
  }
  return ready
}

async function main(args = process.argv.slice(2)) {
  const { mode, dryRun, targets } = parseArgs(args)
  const source = require('../package.json')
  const infos = await loadPackages(targets, source, mode !== 'check')
  const names = mode === 'all' || mode === 'check' ? ['vscode', 'openvsx'] : [mode]
  for (const info of infos) console.log(`${source.publisher}.${source.name} ${source.version}@${info.target} ${(info.size / 1024 / 1024).toFixed(2)} MiB SHA-256 ${info.sha256}`)
  if (dryRun) {
    console.log(`演练通过：将向 ${names.join(' + ')} 发布以上包；未联网、未读取凭据、未上传。`)
    return
  }
  const adapters = names.map(name => name === 'vscode' ? marketplaceAdapter(source, mode === 'check') : openVsxAdapter(source))
  if (mode === 'check') {
    if (!await checkPackages(infos, adapters)) process.exitCode = 2
    return
  }
  const results = await publishPackages(infos, adapters)
  console.log(results.every(result => result.public) ? '所选市场与平台全部公开可用。' : '上传流程完成。稍后运行 yarn publish:check 核对公开状态。')
}

if (require.main === module) main().catch(error => {
  console.error(redact(error instanceof Error ? error.message : String(error)))
  process.exitCode = 1
})

module.exports = { parseArgs, loadPackages, publishPackages, checkPackages }
