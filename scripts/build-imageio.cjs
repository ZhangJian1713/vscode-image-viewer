/* Build a universal, ABI-stable Node-API module. No third-party native library is linked. */
const fs = require('fs')
const path = require('path')
const { execFileSync } = require('child_process')
const { validateTarget } = require('./vsix-targets.cjs')
const target = process.env.IMAGE_VIEWER_VSIX_TARGET && validateTarget(process.env.IMAGE_VIEWER_VSIX_TARGET)

if (target && !target.startsWith('darwin-')) {
  console.log(`ImageIO skipped for ${target}.`)
  process.exit(0)
}

if (process.platform !== 'darwin') {
  if (target) throw new Error('macOS ImageIO packages must be built on macOS.')
  console.log('ImageIO native build skipped on this platform.')
  process.exit(0)
}
const root = path.resolve(__dirname, '..')
const include = process.env.IMAGE_VIEWER_NODE_INCLUDE || path.resolve(path.dirname(process.execPath), '../include/node')
if (!fs.existsSync(path.join(include, 'node_api.h'))) {
  throw new Error('Node headers missing. Set IMAGE_VIEWER_NODE_INCLUDE to a Node include/node directory.')
}
const output = path.join(root, 'native/build/imageio.node')
fs.mkdirSync(path.dirname(output), { recursive: true })
execFileSync('/usr/bin/clang', [
  '-bundle', '-undefined', 'dynamic_lookup', '-fobjc-arc', '-O2', '-Wall', '-Wextra', '-Werror',
  '-arch', 'arm64', '-arch', 'x86_64', '-mmacosx-version-min=11.0', '-DNAPI_VERSION=8',
  '-DNODE_GYP_MODULE_NAME=imageio', '-I', include,
  '-framework', 'Foundation', '-framework', 'CoreGraphics', '-framework', 'ImageIO',
  path.join(root, 'native/imageio.m'), '-o', output
], { stdio: 'inherit' })
console.log('Built universal macOS ImageIO module (arm64 + x86_64, Node-API 8).')
