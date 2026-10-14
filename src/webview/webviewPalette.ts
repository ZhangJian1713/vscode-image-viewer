import type { WebviewUiThemePreference } from '../types'
import { VSCODE_DEFAULT_COLORS } from './vscodeDefaultColors'

export type HostThemeSnapshot = {
  dark: boolean
  colors: Record<keyof typeof VSCODE_DEFAULT_COLORS.light, string>
}

export function effectiveWebviewTheme(preference: WebviewUiThemePreference, hostDark: boolean): 'light' | 'dark' {
  return preference === 'follow' ? (hostDark ? 'dark' : 'light') : preference
}

const TOKEN_MAPPING = {
  '--iv-background': 'editor.background',
  '--iv-primary-fg': 'editor.foreground',
  '--iv-ui-fg': 'foreground',
  '--iv-secondary-fg': 'descriptionForeground',
  '--iv-placeholder-fg': 'input.placeholderForeground',
  '--iv-icon-muted': 'icon.foreground',
  '--iv-link-fg': 'textLink.foreground',
  '--iv-error-fg': 'errorForeground',
  '--iv-border': 'widget.border',
  '--iv-focus-border': 'focusBorder',
  '--iv-sidebar-background': 'sideBar.background',
  '--iv-sidebar-fg': 'sideBar.foreground',
  '--iv-input-background': 'input.background',
  '--iv-input-fg': 'input.foreground',
  '--iv-input-border': 'input.border',
  '--iv-popup-background': 'dropdown.background',
  '--iv-popup-fg': 'dropdown.foreground',
  '--iv-popup-border': 'dropdown.border',
  '--iv-accent': 'button.background',
  '--iv-button-fg': 'button.foreground',
  '--iv-button-hover': 'button.hoverBackground',
  '--iv-selected-background': 'list.activeSelectionBackground',
  '--iv-selected-fg': 'list.activeSelectionForeground',
  '--iv-hover-background': 'list.hoverBackground'
} as const

export type WebviewPalette = {
  colors: HostThemeSnapshot['colors']
  tokens: Record<keyof typeof TOKEN_MAPPING | '--iv-thumb-edge', string>
}

/** Follow 使用当前宿主颜色；Light / Dark 使用独立预存默认色，映射逻辑只有一份。 */
export function resolveWebviewPalette(preference: WebviewUiThemePreference, host: HostThemeSnapshot): WebviewPalette {
  const colors = preference === 'follow' ? host.colors : VSCODE_DEFAULT_COLORS[preference]
  const tokens = {} as WebviewPalette['tokens']
  Object.entries(TOKEN_MAPPING).forEach(([token, key]) => {
    tokens[token] = colors[key]
  })
  tokens[
    '--iv-thumb-edge'
  ] = `color-mix(in srgb, ${colors['editor.foreground']} 8%, ${colors['editor.background']} 92%)`
  return { colors, tokens }
}
