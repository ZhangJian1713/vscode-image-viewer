import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { createGalleryEntry, imageViewerPanelInstanceKey, imageViewerPanelTitle } from '../imageViewerPanelScope'

let root: string
let roots: string[]
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'gallery-entry-'))
  roots = [path.join(root, 'one'), path.join(root, 'two')]
  for (const dir of roots) {
    fs.mkdirSync(path.join(dir, 'images/empty'), { recursive: true })
    fs.writeFileSync(path.join(dir, 'images/picture.JPG'), 'fixture')
    fs.writeFileSync(path.join(dir, 'images/app.json'), '{}')
  }
})
afterEach(() => fs.rmSync(root, { recursive: true, force: true }))
test('root, child directory, image and ordinary file share the same project panel', () => {
  const entries = [undefined, roots[0], path.join(roots[0], 'images/empty'),
    path.join(roots[0], 'images/picture.JPG'), path.join(roots[0], 'images/app.json')]
    .map((arg) => createGalleryEntry(arg, roots[0], roots))
  expect(entries.map((entry) => entry.kind)).toEqual(['root', 'folder', 'folder', 'image', 'file'])
  expect(new Set(entries.map((entry) => imageViewerPanelInstanceKey([entry], roots[0]))).size).toBe(1)
  expect(entries.map((entry) => imageViewerPanelTitle([entry], roots[0], 'Images Viewer'))).toEqual(
    entries.map(() => 'Images Viewer — one'))
})
test('a resource in another workspace folder selects that root and gets a different panel', () => {
  const entry = createGalleryEntry({ fsPath: path.join(roots[1], 'images/app.json') }, roots[0], roots)
  expect(entry.rootPath).toBe(roots[1])
  expect(imageViewerPanelInstanceKey([entry], roots[0])).not.toBe(imageViewerPanelInstanceKey([], roots[0]))
  expect(() => createGalleryEntry(path.join(root, 'outside'), roots[0], roots)).toThrow('outside')
})
