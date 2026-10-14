import { execFileSync } from 'child_process'
import * as path from 'path'

test('real adapters load packaged native modules in an actual Node process', () => {
  const output = execFileSync(process.execPath, [path.join(process.cwd(), 'scripts/test-thumbnail-adapters.cjs')], {
    cwd: process.cwd(), encoding: 'utf8', timeout: 20000
  })
  expect(output).toContain(`Real adapters passed: ${process.platform === 'darwin' ? 'imageioThumbnail' : 'sharpThumbnail'}`)
})
