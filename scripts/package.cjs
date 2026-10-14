const fs = require('fs')
const { execFileSync } = require('child_process')
const { hostTarget, validateTarget } = require('./vsix-targets.cjs')
const env = { ...process.env, IMAGE_VIEWER_VSIX_TARGET: validateTarget(process.env.IMAGE_VIEWER_VSIX_TARGET || hostTarget()) }
if (env.IMAGE_VIEWER_VSIX_TARGET.startsWith('darwin-') && process.platform !== 'darwin') throw new Error('macOS packages must be built on macOS.')
const yarn = process.platform === 'win32' ? 'yarn.cmd' : 'yarn'
if (env.IMAGE_VIEWER_UI_PREBUILT === '1') {
  for (const file of ['distWebview/app.js', 'distWebview/single.js', 'distWebview/index.html', 'distWebview/single.html']) {
    if (!fs.existsSync(file)) throw new Error(`Missing prebuilt WebView: ${file}`)
  }
} else execFileSync(yarn, ['ui-build'], { stdio: 'inherit', env, shell: process.platform === 'win32' })
execFileSync(yarn, ['native:package'], { stdio: 'inherit', env, shell: process.platform === 'win32' })
execFileSync(process.execPath, [require.resolve('webpack-cli/bin/cli.js'), '--config', 'webpack.extension.js', '--mode', 'production', '--devtool', 'hidden-source-map'], { stdio: 'inherit', env })
