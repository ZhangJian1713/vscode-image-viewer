import picomatch from 'picomatch'
import type { TranslationKey } from './i18n/en'

export class FolderFilterError extends Error {
  constructor(public readonly key: TranslationKey, message: string, public readonly pattern = '') {
    super(message)
    Object.setPrototypeOf(this, FolderFilterError.prototype)
  }
}

type FolderRule = {
  prefix: string
  matches: (_folder: string) => boolean
}

export interface FolderFilterPlan {
  includes: (_folder: string) => boolean
  excludes: (_folder: string) => boolean
  scanRoots: (_scope?: string) => string[]
}

/** UI 输入一行一条；不拆逗号，保留 brace glob 及旧配置中的逗号目录名。 */
export function parseFolderFilterInput(input: string): string[] {
  return Array.from(
    new Set(
      input
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
    )
  )
}

function normalizeFolder(value: string): string {
  return value
    .replace(/\\/g, '/')
    .split('/')
    .filter((part) => part && part !== '.')
    .join('/')
}

/** 同一编译计划供宿主和 Mock 使用；目录匹配后继承到整个子树，exclude 始终优先。 */
export function compileFolderFilters(
  includeFolders: string[],
  excludeFolders: string[],
  nocase = false
): FolderFilterPlan {
  const canonical = (value: string) => (nocase ? value.toLowerCase() : value)
  const within = (folder: string, parent: string) => !parent || folder === parent || folder.startsWith(`${parent}/`)
  const compile = (patterns: string[]): FolderRule[] => {
    if (!Array.isArray(patterns) || patterns.length > 64) {
      throw new FolderFilterError('filters.tooMany', 'Use at most 64 folder rules in each field.')
    }
    return patterns
      .filter((pattern) => typeof pattern === 'string' && pattern.trim())
      .map((pattern) => {
        const value = normalizeFolder(pattern.trim())
        if (value.length > 512) {
          throw new FolderFilterError('filters.tooLong', 'Each folder rule must be at most 512 characters.')
        }
        if (/^[a-z]:/i.test(value) || value.split('/').includes('..')) {
          throw new FolderFilterError('filters.relative', `“${pattern}”: use a project-relative folder path without “..”.`, pattern)
        }
        if (value.startsWith('!') || /[?*+@!]\(/.test(value)) {
          throw new FolderFilterError('filters.alternatives', `“${pattern}”: use the exclude field for exclusions and {a,b} for alternatives.`, pattern)
        }
        if (!value || value === '**') {
          return { prefix: '', matches: () => true }
        }
        const options = {
          dot: true,
          nocase,
          strictBrackets: true,
          noextglob: true,
          nonegate: true,
          regex: false,
          maxLength: 512
        }
        try {
          const match = picomatch(value, options)
          const scan = picomatch.scan(value, options)
          const prefix = canonical(normalizeFolder(scan.isGlob ? scan.base : value))
          return {
            prefix,
            matches: scan.isGlob ? match : (folder: string) => folder === prefix
          }
        } catch {
          throw new FolderFilterError('filters.invalidGlob', `“${pattern}”: invalid Glob expression; check brackets and braces.`, pattern)
        }
      })
  }
  const included = compile(includeFolders)
  const excluded = compile(excludeFolders)
  const matchesTree = (folder: string, rules: FolderRule[]) => {
    if (rules.some((rule) => rule.matches(''))) {
      return true
    }
    let current = canonical(normalizeFolder(folder))
    while (current) {
      if (rules.some((rule) => rule.matches(current))) {
        return true
      }
      const slash = current.lastIndexOf('/')
      current = slash < 0 ? '' : current.slice(0, slash)
    }
    return false
  }
  return {
    includes: (folder) => !included.length || matchesTree(folder, included),
    excludes: (folder) => matchesTree(folder, excluded),
    scanRoots: (scope = '') => {
      const scoped = canonical(normalizeFolder(scope))
      const roots = included.length ? included.map((rule) => rule.prefix) : ['']
      const candidates: string[] = []
      for (const prefix of roots) {
        if (within(scoped, prefix)) {
          candidates.push(scoped)
        } else if (within(prefix, scoped)) {
          candidates.push(prefix)
        }
      }
      // 静态前缀可直接开始扫描，去掉已被父根覆盖的重复根，不展开 brace 成路径数组。
      const minimal: string[] = []
      for (const candidate of candidates.sort((a, b) => a.length - b.length)) {
        if (!minimal.some((root) => within(candidate, root)) && !matchesTree(candidate, excluded)) {
          minimal.push(candidate)
        }
      }
      return minimal
    }
  }
}
