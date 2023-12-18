import { IConfig } from "types";
import { utils } from '@easy_vscode/core'
import fs from 'fs'
import json5 from 'json5'

const { getProjectPath, envVars } = utils

const DEFAULT_CONFIG: IConfig = {
  showImageTypes: ['.svg', '.png', '.jpeg', '.jpg', '.ico', '.gif', '.webp', '.bmp', '.tif', '.tiff', '.apng', '.avif'],
  keyword: '',
  activeKey: [],
  backgroundColor: '#fff',
  size: 100,
  includeFolders: [],
  excludeFolders: [],

}

const PROJECTS_CONFIG_DIRECTORY = 'projectsConfig'

const getConfigDirectoryPath = () => `${envVars.extensionPath}${PROJECTS_CONFIG_DIRECTORY}`

const getConfigFilePath = () => {
  const projectPath = getProjectPath()
  const base64ProjectPath = Buffer.from(projectPath).toString('base64').replace(/\//g, '_').replace(/\+/g, '-');
  return `${getConfigDirectoryPath()}/${base64ProjectPath}.json`
}

export const writeLocalConfigFile = (data: IConfig) => {
  try {
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
    const configFilePath = getConfigFilePath();
    // Check if the file exists, if not, create it with default config
    if (!fs.existsSync(configFilePath)) {
      return DEFAULT_CONFIG
    }
    const fileContents = fs.readFileSync(configFilePath, 'utf8');
    return json5.parse(fileContents);
  } catch (e) {
    console.error(e);
  }
}