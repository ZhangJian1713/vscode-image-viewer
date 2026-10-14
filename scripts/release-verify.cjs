/* Verify the host build restored by vsix:release; this command never rebuilds or uploads. */
const path = require('path')
const { execFileSync } = require('child_process')
const root = path.resolve(__dirname, '..')
const run = (script, args = [], env = process.env) => execFileSync(process.execPath, [path.join(root, 'scripts', script), ...args], { cwd: root, stdio: 'inherit', env })

try {
  run('test-thumbnail-adapters.cjs')
  if (process.platform === 'darwin') {
    run('test-imageio.cjs', [], { ...process.env, IMAGE_VIEWER_IMAGEIO_MODULE: path.join(root, 'dist/native/imageio.node') })
  } else {
    run('test-sharp.cjs', [], { ...process.env, IMAGE_VIEWER_SHARP_RUNTIME: path.join(root, 'dist/native/sharp-runtime') })
  }
  run('publish.cjs', ['all', '--dry-run'])
} catch (error) {
  if (!error.status) console.error(error.message)
  process.exitCode = error.status || 1
}
