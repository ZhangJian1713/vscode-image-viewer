import { VSCODE_DEFAULT_COLORS } from './vscodeDefaultColors'
import type { HostThemeSnapshot } from './webviewPalette'

/** Detect VS Code webview theme from injected CSS variables (not OS prefers-color-scheme alone). */

function parseCssColorToRgb(input: string): [number, number, number] | null {
  const s = input.trim()
  if (!s) {
    return null
  }
  if (s.startsWith('#')) {
    const hex = s.slice(1)
    if (hex.length === 3) {
      return [parseInt(hex[0] + hex[0], 16), parseInt(hex[1] + hex[1], 16), parseInt(hex[2] + hex[2], 16)]
    }
    if (hex.length === 6) {
      return [parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16)]
    }
  }
  const m = s.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/)
  if (m) {
    return [Number(m[1]), Number(m[2]), Number(m[3])]
  }
  return null
}

function relativeLuminance(r: number, g: number, b: number): number {
  const linear = [r, g, b].map((c) => {
    const x = c / 255
    return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4)
  })
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2]
}

export function isVscodeThemeDark(): boolean {
  // VS Code 将主题 kind/class 与 CSS 变量放在 body 上；先使用明确的宿主分类。
  const kind = document.body.getAttribute('data-vscode-theme-kind')
  if (kind === 'vscode-light' || kind === 'vscode-high-contrast-light') {
    return false
  }
  if (kind === 'vscode-dark' || kind === 'vscode-high-contrast') {
    return true
  }
  if (
    document.body.classList.contains('vscode-light') ||
    document.body.classList.contains('vscode-high-contrast-light')
  ) {
    return false
  }
  if (document.body.classList.contains('vscode-dark') || document.body.classList.contains('vscode-high-contrast')) {
    return true
  }
  const raw =
    getComputedStyle(document.body).getPropertyValue('--vscode-editor-background') ||
    getComputedStyle(document.documentElement).getPropertyValue('--vscode-editor-background')
  const rgb = parseCssColorToRgb(raw)
  if (!rgb) {
    return window.matchMedia('(prefers-color-scheme: dark)').matches
  }
  return relativeLuminance(rgb[0], rgb[1], rgb[2]) < 0.45
}

/** 一次读取当前宿主 token；不要读取插件覆盖后的背景/前景作为宿主信息。 */
export function readVscodeThemeSnapshot(): HostThemeSnapshot {
  const dark = isVscodeThemeDark()
  const fallback = VSCODE_DEFAULT_COLORS[dark ? 'dark' : 'light']
  const body = getComputedStyle(document.body)
  const root = getComputedStyle(document.documentElement)
  const colors = {} as HostThemeSnapshot['colors']
  Object.keys(fallback).forEach((key) => {
    const property = `--vscode-${key.replace(/\./g, '-')}`
    colors[key] = body.getPropertyValue(property).trim() || root.getPropertyValue(property).trim() || fallback[key]
  })
  return { dark, colors }
}

/** 同一明暗种类也可能换配色；按宿主快照变化通知，避免监听自身样式后反复渲染。 */
export function subscribeVsCodeTheme(onChange: (_snapshot: HostThemeSnapshot) => void): () => void {
  let timer: number | undefined
  let previous = ''
  const publish = () => {
    const snapshot = readVscodeThemeSnapshot()
    const fingerprint = JSON.stringify(snapshot)
    if (fingerprint !== previous) {
      previous = fingerprint
      onChange(snapshot)
    }
  }
  const schedule = () => {
    if (timer !== undefined) {
      window.clearTimeout(timer)
    }
    timer = window.setTimeout(() => {
      timer = undefined
      publish()
    }, 50)
  }
  publish()
  const mq = window.matchMedia('(prefers-color-scheme: dark)')
  mq.addEventListener('change', schedule)
  const observer = new MutationObserver(schedule)
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['style', 'class'] })
  observer.observe(document.body, { attributes: true, attributeFilter: ['style', 'class', 'data-vscode-theme-kind'] })
  if (document.head) {
    observer.observe(document.head, { childList: true, subtree: true })
  }
  return () => {
    mq.removeEventListener('change', schedule)
    observer.disconnect()
    if (timer !== undefined) {
      window.clearTimeout(timer)
    }
  }
}
