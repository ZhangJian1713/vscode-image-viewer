import { IConfig } from 'types'
import { utils } from '@easy_vscode/core'
import * as fs from 'fs'
import json5 from 'json5'
import { randomBytes } from 'crypto'
import { validateConfig } from './configValidation'
import { BACKGROUND_TRANSPARENT } from '../../constants'

const { getProjectPath, envVars } = utils

const DEFAULT_CONFIG: IConfig = {
  showImageTypes: ['.svg', '.png', '.jpeg', '.jpg', '.ico', '.gif', '.webp', '.bmp', '.tif', '.tiff', '.apng', '.avif'],
  keyword: '',
  activeKey: [],
  backgroundColor: BACKGROUND_TRANSPARENT,
  includeFolders: [],
  excludeFolders: [],
  uiTheme: 'follow',
  imageSort: 'nameAsc',
  galleryGroupByFolder: true,
  galleryLayout: 'grid'
}

const PROJECTS_CONFIG_DIRECTORY = 'projectsConfig'

const getConfigDirectoryPath = () => `${envVars.extensionPath}${PROJECTS_CONFIG_DIRECTORY}`

const getConfigFilePath = (projectPath = getProjectPath()) => {
  const base64ProjectPath = Buffer.from(projectPath).toString('base64').replace(/\//g, '_').replace(/\+/g, '-')
  return `${getConfigDirectoryPath()}/${base64ProjectPath}.json`
}

export const writeLocalConfigFile = (data: IConfig, projectPath = getProjectPath()) => {
  const persistentData = validateConfig(data)
  const localConfigDirectory = getConfigDirectoryPath()
  fs.mkdirSync(localConfigDirectory, { recursive: true })
  const newConfig = { ...readLocalConfigFile(projectPath), ...persistentData }
  const target = getConfigFilePath(projectPath)
  const temporary = `${target}.${randomBytes(12).toString('hex')}.tmp`
  try {
    fs.writeFileSync(temporary, json5.stringify(newConfig, null, 2), { encoding: 'utf8', flag: 'wx', mode: 0o600 })
    fs.renameSync(temporary, target)
  } finally {
    if (fs.existsSync(temporary)) { fs.unlinkSync(temporary) }
  }
}

export const readLocalConfigFile = (projectPath = getProjectPath()): IConfig => {
  try {
    const configFilePath = getConfigFilePath(projectPath)
    // Check if the file exists, if not, create it with default config
    if (!fs.existsSync(configFilePath)) {
      return { ...DEFAULT_CONFIG }
    }
    const stat = fs.lstatSync(configFilePath)
    if (!stat.isFile() || stat.size > 4 * 1024 * 1024) { return { ...DEFAULT_CONFIG } }
    const fileContents = fs.readFileSync(configFilePath, 'utf8')
    return { ...DEFAULT_CONFIG, ...validateConfig(json5.parse(fileContents), false) }
  } catch (e) {
    console.error(e)
    return { ...DEFAULT_CONFIG }
  }
}
