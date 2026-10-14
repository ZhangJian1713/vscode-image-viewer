import * as React from 'react'
import { ConfigProvider, theme } from 'antd'
import './antd-global.css'
import { readVscodeThemeSnapshot, subscribeVsCodeTheme } from './vscodeTheme'
import { applyBodySemanticTokens, clearBodySemanticTokens } from './semanticTokens'
import { resolveWebviewPalette, effectiveWebviewTheme } from './webviewPalette'
import { WebviewThemeProvider } from './WebviewThemeContext'
import type { WebviewUiThemePreference } from 'types'

const NO_CURRENT_VIEW = '$currentView$'

export interface WebviewRootProps {
  components: Record<string, React.FC>
}

/** Align Ant Design with VS Code or user-forced light/dark (no webview reload). */
export const AntdWebviewShell: React.FC<WebviewRootProps> = ({ components }) => {
  const [hostTheme, setHostTheme] = React.useState(readVscodeThemeSnapshot)
  const vscodeIsDark = hostTheme.dark
  const [uiThemePreference, setUiThemePreference] = React.useState<WebviewUiThemePreference>('follow')
  React.useEffect(() => subscribeVsCodeTheme(setHostTheme), [])

  const effectiveTheme = effectiveWebviewTheme(uiThemePreference, vscodeIsDark)
  const effectiveIsDark = effectiveTheme === 'dark'
  const palette = React.useMemo(
    () => resolveWebviewPalette(uiThemePreference, hostTheme),
    [uiThemePreference, hostTheme]
  )
  const cyclePreference = React.useCallback(() => {
    setUiThemePreference((p) => (p === 'follow' ? 'light' : p === 'light' ? 'dark' : 'follow'))
  }, [])

  const themeCtx = React.useMemo(
    () => ({
      vscodeIsDark,
      preference: uiThemePreference,
      effectiveIsDark,
      setPreference: setUiThemePreference,
      cyclePreference
    }),
    [vscodeIsDark, uiThemePreference, effectiveIsDark, cyclePreference]
  )

  const rootWrapStyle: React.CSSProperties = {
    ...palette.tokens,
    backgroundColor: palette.tokens['--iv-background'],
    color: palette.tokens['--iv-primary-fg']
  }

  React.useEffect(() => {
    // Portal 与页面始终共用同一份 palette，手动主题不改写宿主 --vscode-* 变量。
    applyBodySemanticTokens(palette.tokens)
    const elements = [document.body, document.getElementById('root')].filter(Boolean)
    const previous = elements.map((element) => ({
      background: element.style.backgroundColor,
      color: element.style.color
    }))
    elements.forEach((element) => {
      element.style.backgroundColor = palette.tokens['--iv-background']
      element.style.color = palette.tokens['--iv-primary-fg']
    })
    return () => {
      clearBodySemanticTokens()
      elements.forEach((element, index) => {
        element.style.backgroundColor = previous[index].background
        element.style.color = previous[index].color
      })
    }
  }, [palette])

  let currentView = (window as any).currentView
  if (currentView === NO_CURRENT_VIEW) {
    currentView = Object.keys(components)[0]
  }
  const CurrentComponent = components[currentView]

  return (
    <WebviewThemeProvider value={themeCtx}>
      <ConfigProvider
        theme={{
          algorithm: effectiveIsDark ? theme.darkAlgorithm : theme.defaultAlgorithm,
          token: {
            colorLink: palette.tokens['--iv-link-fg'],
            colorPrimary: palette.tokens['--iv-accent'],
            colorPrimaryHover: palette.tokens['--iv-button-hover'],
            colorText: palette.tokens['--iv-ui-fg'],
            colorBgContainer: palette.tokens['--iv-input-background'],
            colorBgElevated: palette.tokens['--iv-popup-background'],
            colorBorder: palette.tokens['--iv-input-border'],
            colorSplit: palette.tokens['--iv-border'],
            controlItemBgHover: palette.tokens['--iv-hover-background'],
            controlItemBgActive: palette.tokens['--iv-selected-background'],
            colorTextDescription: 'var(--iv-secondary-fg)',
            colorTextSecondary: 'var(--iv-secondary-fg)',
            colorTextPlaceholder: 'var(--iv-placeholder-fg)'
          },
          components: {
            Button: { primaryColor: palette.tokens['--iv-button-fg'] },
            Tree: {
              nodeSelectedBg: palette.tokens['--iv-selected-background'],
              nodeSelectedColor: palette.tokens['--iv-selected-fg']
            },
            Input: {
              colorText: palette.tokens['--iv-input-fg'],
              activeBorderColor: palette.tokens['--iv-focus-border']
            },
            Select: { colorText: palette.tokens['--iv-input-fg'] }
          }
        }}
        getPopupContainer={(triggerNode) => {
          if (triggerNode) {
            return triggerNode
          }
          return document.body
        }}
      >
        <div
          className='webview-app-root'
          data-ui-theme={uiThemePreference}
          data-effective-theme={effectiveTheme}
          style={rootWrapStyle}
        >
          <CurrentComponent />
        </div>
      </ConfigProvider>
    </WebviewThemeProvider>
  )
}
