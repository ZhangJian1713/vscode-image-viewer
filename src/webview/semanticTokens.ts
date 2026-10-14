import type { WebviewPalette } from './webviewPalette'

/** Portal 与根节点共用 token；清理只移除本模块持有的变量。 */
let installedKeys: string[] = []
export function applyBodySemanticTokens(tokens: WebviewPalette['tokens']): void {
  installedKeys = Object.keys(tokens)
  Object.entries(tokens).forEach(([key, value]) => document.body.style.setProperty(key, value))
}

export function clearBodySemanticTokens(): void {
  installedKeys.forEach((key) => document.body.style.removeProperty(key))
  installedKeys = []
}
