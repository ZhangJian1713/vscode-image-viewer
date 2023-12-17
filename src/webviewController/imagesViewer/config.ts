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
  includeFolders: '',
  excludeFolders: '',

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
    const finalData = {
      ...data,
      includeFolders: data.includeFolders.split('\n'),
      excludeFolders: data.excludeFolders.split('\n'),
    }
    let jsonStr = json5.stringify(finalData, null, 2);
    // Check if the directory exists, if not, create it
    const localConfigDirectory = getConfigDirectoryPath()
    if (!fs.existsSync(localConfigDirectory)) {
      fs.mkdirSync(localConfigDirectory, { recursive: true });
    }
    fs.writeFileSync(getConfigFilePath(), jsonStr, 'utf8');
  } catch (e) {
    console.error(e);
  }
}

export const readLocalConfigFile = (): IConfig => {
  try {
    // Check if the directory exists, if not, create it
    const localConfigDirectory = getConfigDirectoryPath()
    if (!fs.existsSync(localConfigDirectory)) {
      fs.mkdirSync(localConfigDirectory, { recursive: true });
    }
    const configFilePath = getConfigFilePath();
    // Check if the file exists, if not, create it with default config
    if (!fs.existsSync(configFilePath)) {
      writeLocalConfigFile(DEFAULT_CONFIG);
    }
    let fileContents = fs.readFileSync(configFilePath, 'utf8');
    let data = json5.parse(fileContents);
    const finalData = {
      ...data,
      includeFolders: data.includeFolders.join('\n'),
      excludeFolders: data.excludeFolders.join('\n'),
    }
    return finalData
  } catch (e) {
    console.error(e);
  }
}