import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { readLocalConfigFile, writeLocalConfigFile } from './config'

let mockExtensionPath = ''
jest.mock('@easy_vscode/core', () => ({ utils: { getProjectPath: () => '/project',
  envVars: { get extensionPath() { return mockExtensionPath } } } }))
let directory: string
beforeEach(() => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'gallery-config-'))
  mockExtensionPath = directory + path.sep
})
afterEach(() => { jest.restoreAllMocks(); fs.rmSync(directory, { recursive: true, force: true }) })

test('valid preferences survive atomic writes while host and unknown fields never persist', () => {
  writeLocalConfigFile({ galleryLayout: 'fill', hostUiLanguage: 'zh', unexpected: true } as any)
  writeLocalConfigFile({ keyword: 'photo' } as any)
  expect(readLocalConfigFile()).toMatchObject({ galleryLayout: 'fill', keyword: 'photo' })
  const file = path.join(directory, 'projectsConfig', fs.readdirSync(path.join(directory, 'projectsConfig'))[0])
  expect(fs.readFileSync(file, 'utf8')).not.toMatch(/hostUiLanguage|unexpected/)
})
test('invalid scan rules cannot replace the previously saved configuration', () => {
  writeLocalConfigFile({ includeFolders: ['photos/**'] } as any)
  expect(() => writeLocalConfigFile({ includeFolders: ['../outside'] } as any)).toThrow()
  expect(readLocalConfigFile().includeFolders).toEqual(['photos/**'])
})
test('write failures propagate, keep old preferences and remove temporary files', () => {
  writeLocalConfigFile({ keyword: 'old' } as any)
  const configDirectory = path.join(directory, 'projectsConfig')
  const target = path.join(configDirectory, fs.readdirSync(configDirectory)[0])
  fs.renameSync(target, target + '.previous')
  fs.mkdirSync(target)
  expect(() => writeLocalConfigFile({ keyword: 'new' } as any)).toThrow()
  fs.rmdirSync(target)
  fs.renameSync(target + '.previous', target)
  expect(readLocalConfigFile().keyword).toBe('old')
  expect(fs.readdirSync(path.join(directory, 'projectsConfig'))).toHaveLength(1)
})
