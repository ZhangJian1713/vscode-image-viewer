const targets = ['darwin-arm64', 'darwin-x64', 'win32-x64', 'win32-arm64', 'linux-x64', 'linux-arm64', 'linux-armhf', 'alpine-x64', 'alpine-arm64']
const releaseTargets = ['darwin-arm64', 'darwin-x64', 'win32-x64', 'win32-arm64']
function validateTarget(target) {
  if (!targets.includes(target)) throw new Error(`Unsupported VSIX target: ${target}. Supported: ${targets.join(', ')}`)
  return target
}
function hostTarget() {
  const platform = process.platform === 'linux' && require('detect-libc').familySync() === 'musl' ? 'alpine' : process.platform
  return validateTarget(`${platform}-${process.arch === 'arm' ? 'armhf' : process.arch}`)
}
function sharpPlatform(target) { return validateTarget(target).replace(/^alpine-/, 'linuxmusl-').replace('linux-armhf', 'linux-arm') }
module.exports = { targets, releaseTargets, validateTarget, hostTarget, sharpPlatform }
