import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { assertProjectResource } from './projectResource'

let temporary: string
let root: string
beforeEach(() => {
  temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'project-resource-'))
  root = path.join(temporary, 'project')
  fs.mkdirSync(root)
  fs.mkdirSync(path.join(temporary, 'project-other'))
  fs.writeFileSync(path.join(root, 'image.jpg'), 'fixture')
  fs.writeFileSync(path.join(root, 'settings.json'), '{}')
  fs.writeFileSync(path.join(temporary, 'project-other', 'outside.jpg'), 'fixture')
})
afterEach(() => fs.rmSync(temporary, { recursive: true, force: true }))

test('supported images and folders remain accessible in the bound project', async () => {
  expect(await assertProjectResource(root, path.join(root, 'image.jpg'), true)).toMatchObject({ relative: 'image.jpg' })
  expect(await assertProjectResource(root, root)).toMatchObject({ relative: '' })
})
test('rejects traversal, sibling prefix collisions, non-images and invalid parameters', async () => {
  for (const value of [null, {}, '', 'image.jpg', path.join(temporary, 'project-other', 'outside.jpg'),
    path.join(root, '..', 'project-other', 'outside.jpg'), path.join(root, 'settings.json'), root]) {
    await expect(assertProjectResource(root, value, true)).rejects.toThrow()
  }
})
test('symlinks cannot escape the project, including a symlink in a parent directory', async () => {
  fs.symlinkSync(path.join(temporary, 'project-other'), path.join(root, 'linked'), 'dir')
  fs.symlinkSync(path.join(temporary, 'project-other', 'outside.jpg'), path.join(root, 'linked.jpg'))
  await expect(assertProjectResource(root, path.join(root, 'linked', 'outside.jpg'), true)).rejects.toThrow('outside')
  await expect(assertProjectResource(root, path.join(root, 'linked.jpg'), true)).rejects.toThrow('outside')
})
test('a user-opened workspace root may itself be a symlink', async () => {
  const alias = path.join(temporary, 'alias')
  fs.symlinkSync(root, alias, 'dir')
  expect(await assertProjectResource(alias, path.join(alias, 'image.jpg'), true)).toMatchObject({ relative: 'image.jpg' })
})
