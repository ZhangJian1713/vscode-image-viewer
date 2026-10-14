/* Stage a self-contained runtime. Foreign platform packages are never installed or executed. */
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const { createRequire } = require('module')
const { execFileSync } = require('child_process')
const { hostTarget, validateTarget, sharpPlatform } = require('./vsix-targets.cjs')
const root = path.resolve(__dirname, '..')
const [nodeMajor, nodeMinor] = process.versions.node.split('.').map(Number)
if (nodeMajor < 20 || (nodeMajor === 20 && nodeMinor < 9)) throw new Error('Sharp runtime preparation requires Node.js >=20.9.')
const build = path.join(root, 'native/build')
const all = process.argv.includes('--all')
const target = process.env.IMAGE_VIEWER_VSIX_TARGET || process.argv.find(arg => arg.startsWith('--target='))?.slice('--target='.length)
if (target) validateTarget(target)
const release = process.argv.includes('--package')
const releaseTarget = release ? (target || hostTarget()) : target
if (release && releaseTarget.startsWith('darwin-')) {
  fs.rmSync(path.join(build, 'sharp-runtime'), { recursive: true, force: true })
  console.log(`Sharp omitted for ${releaseTarget}; macOS uses ImageIO.`)
  process.exit(0)
}
const targetPlatform = releaseTarget && sharpPlatform(releaseTarget)
const platforms = targetPlatform ? [targetPlatform] : all ? ['darwin-arm64', 'darwin-x64', 'win32-x64', 'win32-arm64', 'linux-x64', 'linux-arm64', 'linuxmusl-x64', 'linuxmusl-arm64', 'linux-arm']
  : [`${process.platform === 'linux' && require('detect-libc').familySync() === 'musl' ? 'linuxmusl' : process.platform}-${process.arch}`]
const destination = path.join(build, `sharp-runtime-${process.pid}`)
const modules = path.join(destination, 'node_modules')
const manifest = []

function findPackage(name, from) {
  const resolver = createRequire(path.join(from, 'package.json'))
  for (const request of [`${name}/package`, `${name}/package.json`, name]) {
    try {
      let directory = path.dirname(resolver.resolve(request))
      while (directory !== path.dirname(directory)) {
        const file = path.join(directory, 'package.json')
        if (fs.existsSync(file) && JSON.parse(fs.readFileSync(file)).name === name) return directory
        directory = path.dirname(directory)
      }
    } catch { /* Try the package's other exported entry points. */ }
  }
}

function copyPackage(source) {
  const pkg = JSON.parse(fs.readFileSync(path.join(source, 'package.json')))
  const target = path.join(modules, pkg.name)
  if (fs.existsSync(target)) return pkg
  // Nested dependencies are flattened deliberately; each required version is resolved from its parent.
  fs.cpSync(source, target, { recursive: true, filter: file => !file.startsWith(path.join(source, 'node_modules')) })
  manifest.push({ name: pkg.name, version: pkg.version, license: pkg.license })
  for (const name of Object.keys(pkg.dependencies || {})) {
    const dependency = findPackage(name, source)
    if (!dependency) throw new Error(`Missing Sharp runtime dependency ${name}; run yarn install.`)
    copyPackage(dependency)
  }
  return pkg
}

async function nativePackage(name, version) {
  const installed = findPackage(name, root)
  if (installed && JSON.parse(fs.readFileSync(path.join(installed, 'package.json'))).version === version) {
    const pkg = copyPackage(installed)
    for (const [dependency, required] of Object.entries(pkg.optionalDependencies || {})) await nativePackage(dependency, required)
    return
  }
  const cache = path.join(build, 'sharp-downloads', `${name.replace(/[@/]/g, '_')}-${version}`)
  const unpacked = path.join(cache, 'package')
  if (!fs.existsSync(path.join(unpacked, 'package.json'))) {
    fs.mkdirSync(cache, { recursive: true })
    const response = await fetch(`https://registry.npmjs.org/${encodeURIComponent(name)}/${version}`)
    if (!response.ok) throw new Error(`Unable to fetch ${name}@${version}: ${response.status}`)
    const metadata = await response.json()
    const tarResponse = await fetch(metadata.dist.tarball)
    if (!tarResponse.ok) throw new Error(`Unable to download ${name}: ${tarResponse.status}`)
    const bytes = Buffer.from(await tarResponse.arrayBuffer())
    const [algorithm, digest] = metadata.dist.integrity.split(' ')[0].split('-')
    if (crypto.createHash(algorithm).update(bytes).digest('base64') !== digest) throw new Error(`Integrity mismatch for ${name}`)
    const archive = path.join(cache, 'package.tgz')
    fs.writeFileSync(archive, bytes)
    const entries = execFileSync('tar', ['-tzf', archive], { encoding: 'utf8' }).trim().split('\n')
    if (entries.some(entry => !entry.startsWith('package/') || entry.split('/').includes('..'))) throw new Error(`Unsafe archive paths in ${name}`)
    execFileSync('tar', ['-xzf', archive, '-C', cache])
    fs.rmSync(archive)
  }
  const pkg = JSON.parse(fs.readFileSync(path.join(unpacked, 'package.json')))
  if (pkg.name !== name || pkg.version !== version) throw new Error(`Unexpected native package ${name}`)
  copyPackage(unpacked)
  for (const [dependency, required] of Object.entries(pkg.optionalDependencies || {})) await nativePackage(dependency, required)
}

async function main() {
  fs.mkdirSync(modules, { recursive: true })
  try {
    const sharpDirectory = findPackage('sharp', root)
    if (!sharpDirectory) throw new Error('Sharp missing; run yarn install.')
    const pkg = copyPackage(sharpDirectory)
    for (const platform of platforms) {
      const name = `@img/sharp-${platform}`, version = pkg.optionalDependencies[name]
      if (!version) throw new Error(`Sharp has no prebuilt binary for ${platform}`)
      await nativePackage(name, version)
    }
    fs.copyFileSync(path.join(root, 'native/sharp-thumbnail.cjs'), path.join(destination, 'thumbnail.cjs'))
    fs.writeFileSync(path.join(destination, 'manifest.json'), JSON.stringify({ sharp: pkg.version, platforms, packages: manifest }, null, 2))
    const final = path.join(build, 'sharp-runtime')
    fs.rmSync(final, { recursive: true, force: true })
    fs.renameSync(destination, final)
    console.log(`Prepared Sharp ${pkg.version}: ${platforms.join(', ')}; ${manifest.length} runtime packages with licenses.`)
  } finally {
    fs.rmSync(destination, { recursive: true, force: true })
  }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
