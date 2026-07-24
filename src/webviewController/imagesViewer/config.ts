import { IConfig } from 'types'
import * as fs from 'fs'
import json5 from 'json5'
import { BACKGROUND_TRANSPARENT } from '../../constants'
import { ExtensionContext, workspace } from 'vscode'

let configStorageRoot: string | null = null

export function initImageViewerConfigStorage(context: ExtensionContext): void {
  configStorageRoot = context.globalStorageUri.fsPath
}

function getProjectPath(): string {
  return workspace.workspaceFolders?.[0]?.uri.fsPath ?? ''
}

const DEFAULT_CONFIG: IConfig = {
  showImageTypes: ['.svg', '.png', '.jpeg', '.jpg', '.ico', '.gif', '.webp', '.bmp', '.tif', '.tiff', '.apng', '.avif'],
  keyword: '',
  activeKey: [],
  backgroundColor: BACKGROUND_TRANSPARENT,
  includeFolders: [],
  excludeFolders: [],
  uiTheme: 'follow',
  imageSort: 'nameAsc'
}

const PROJECTS_CONFIG_DIRECTORY = 'projectsConfig'

const getConfigDirectoryPath = () => configStorageRoot ? `${configStorageRoot}/${PROJECTS_CONFIG_DIRECTORY}` : ''

const getConfigFilePath = () => {
  const projectPath = getProjectPath()
  const base64ProjectPath = Buffer.from(projectPath).toString('base64').replace(/\//g, '_').replace(/\+/g, '-');
  return `${getConfigDirectoryPath()}/${base64ProjectPath}.json`
}

export const writeLocalConfigFile = (data: IConfig) => {
  try {
    if (!configStorageRoot) return
    // Check if the directory exists, if not, create it
    const localConfigDirectory = getConfigDirectoryPath()
    if (!fs.existsSync(localConfigDirectory)) {
      fs.mkdirSync(localConfigDirectory, { recursive: true });
    }
    const oldConfig = readLocalConfigFile()
    const newConfig = { ...oldConfig, ...data }
    const jsonStr = json5.stringify(newConfig, null, 2);
    fs.writeFileSync(getConfigFilePath(), jsonStr, 'utf8');
  } catch (e) {
    console.error(e);
  }
}

export const readLocalConfigFile = (): IConfig => {
  try {
    if (!configStorageRoot) return DEFAULT_CONFIG
    const configFilePath = getConfigFilePath();
    // Check if the file exists, if not, create it with default config
    if (!fs.existsSync(configFilePath)) {
      return DEFAULT_CONFIG
    }
    const fileContents = fs.readFileSync(configFilePath, 'utf8');
    return json5.parse(fileContents) as IConfig
  } catch (e) {
    console.error(e)
    return DEFAULT_CONFIG
  }
}
