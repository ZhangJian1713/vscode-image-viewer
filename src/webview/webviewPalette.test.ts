/** @jest-environment jsdom */
import { VSCODE_DEFAULT_COLORS } from './vscodeDefaultColors'
import { effectiveWebviewTheme, resolveWebviewPalette } from './webviewPalette'
import { isVscodeThemeDark, readVscodeThemeSnapshot, subscribeVsCodeTheme } from './vscodeTheme'
import { applyBodySemanticTokens, clearBodySemanticTokens } from './semanticTokens'

beforeEach(() => {
  document.body.removeAttribute('style')
  document.body.className = ''
  document.body.removeAttribute('data-vscode-theme-kind')
  document.documentElement.removeAttribute('style')
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: () => ({
      matches: false,
      addEventListener: jest.fn(),
      removeEventListener: jest.fn()
    })
  })
})
afterEach(() => {
  clearBodySemanticTokens()
  jest.useRealTimers()
})

test.each(['light', 'dark'] as const)(
  'Follow and manual %s share all colors when the host uses that default',
  (theme) => {
    const host = { dark: theme === 'dark', colors: VSCODE_DEFAULT_COLORS[theme] }
    expect(resolveWebviewPalette('follow', host)).toEqual(resolveWebviewPalette(theme, host))
    expect(effectiveWebviewTheme('follow', host.dark)).toBe(theme)
  }
)

test('Follow inherits customized host colors while both manual presets remain independent', () => {
  const host = {
    dark: true,
    colors: {
      ...VSCODE_DEFAULT_COLORS.dark,
      'editor.background': '#21152d',
      'input.background': '#352242',
      'button.background': '#9860cb'
    }
  }
  const follow = resolveWebviewPalette('follow', host)
  expect(follow.tokens['--iv-background']).toBe('#21152d')
  expect(follow.tokens['--iv-input-background']).toBe('#352242')
  expect(follow.tokens['--iv-accent']).toBe('#9860cb')
  for (const theme of ['light', 'dark'] as const) {
    expect(resolveWebviewPalette(theme, host).colors).toEqual(VSCODE_DEFAULT_COLORS[theme])
  }
})

test('host detection uses body theme kind and colors instead of plugin overrides or OS mode', () => {
  document.body.className = 'vscode-dark'
  document.body.style.setProperty('--vscode-editor-background', '#21152d')
  document.body.style.backgroundColor = '#ffffff'
  expect(isVscodeThemeDark()).toBe(true)
  expect(readVscodeThemeSnapshot().colors['editor.background']).toBe('#21152d')
  document.body.setAttribute('data-vscode-theme-kind', 'vscode-high-contrast-light')
  expect(isVscodeThemeDark()).toBe(false)
  document.body.className = ''
  document.body.removeAttribute('data-vscode-theme-kind')
  expect(isVscodeThemeDark()).toBe(true)
})

test('same-kind color changes publish, own style updates do not loop, and teardown stops notifications', async () => {
  jest.useFakeTimers()
  document.body.className = 'vscode-dark'
  const publish = jest.fn()
  const dispose = subscribeVsCodeTheme(publish)
  const flush = async () => {
    await Promise.resolve()
    jest.advanceTimersByTime(51)
  }
  expect(publish).toHaveBeenCalledTimes(1)
  applyBodySemanticTokens(resolveWebviewPalette('dark', readVscodeThemeSnapshot()).tokens)
  await flush()
  expect(publish).toHaveBeenCalledTimes(1)
  document.body.style.setProperty('--vscode-editor-background', '#21152d')
  await flush()
  expect(publish).toHaveBeenCalledTimes(2)
  expect(publish.mock.calls[1][0].dark).toBe(true)
  document.body.className = 'vscode-light'
  await flush()
  expect(publish).toHaveBeenCalledTimes(3)
  expect(publish.mock.calls[2][0].dark).toBe(false)
  dispose()
  document.body.className = 'vscode-dark'
  await flush()
  expect(publish).toHaveBeenCalledTimes(3)
  clearBodySemanticTokens()
  expect(document.body.style.getPropertyValue('--vscode-editor-background')).toBe('#21152d')
  expect(document.body.style.getPropertyValue('--iv-background')).toBe('')
})
