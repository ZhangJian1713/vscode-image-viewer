/* Serial builds share dist; never run targets concurrently in the same checkout. */
const { execFileSync } = require('child_process')
const { targets, releaseTargets, validateTarget, hostTarget } = require('./vsix-targets.cjs')
const requested = process.argv.slice(2)
if (requested.includes('--release') && requested.length !== 1) throw new Error('--release 不与其他平台参数混用。')
const selected = requested[0] === '--release' ? releaseTargets : requested.length ? requested.map(validateTarget) : targets
if (selected.some(target => target.startsWith('darwin-')) && process.platform !== 'darwin') throw new Error('The full matrix must be built on macOS for ImageIO.')
const yarn = process.platform === 'win32' ? 'yarn.cmd' : 'yarn'
execFileSync(yarn, ['ui-build'], { stdio: 'inherit', shell: process.platform === 'win32' })
for (const target of selected) {
  const env = { ...process.env, IMAGE_VIEWER_VSIX_TARGET: target, IMAGE_VIEWER_UI_PREBUILT: '1' }
  execFileSync(yarn, ['vsix'], { stdio: 'inherit', env, shell: process.platform === 'win32' })
  execFileSync(process.execPath, ['scripts/openvsx.cjs', 'check', `image-viewer-${require('../package.json').version}-${target}.vsix`, '--offline'], { stdio: 'inherit', env })
}
// Restore the host build for F5 after the matrix's final foreign target.
execFileSync(process.execPath, ['scripts/package.cjs'], { stdio: 'inherit', env: { ...process.env, IMAGE_VIEWER_VSIX_TARGET: hostTarget(), IMAGE_VIEWER_UI_PREBUILT: '1' } })
