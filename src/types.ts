export interface IConfigWorkspaceFolders {[key: string]: boolean}

export interface IConfig {
  showImageTypes: string[],
  keyword: string,
  activeKey: string[]
  backgroundColor: string,
  size: number,
  includeFolders: string[],
  excludeFolders: string[],
  includeProjectFolders: IConfigWorkspaceFolders,
}