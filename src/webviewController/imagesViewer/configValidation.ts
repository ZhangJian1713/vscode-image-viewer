import { IConfig } from '../../types'
import { compileFolderFilters } from '../../folderFilterRules'
import { IMAGE_FILE_PATTERNS } from '../../constants'

const stringList = (value: unknown, count = 10000, length = 32768): value is string[] =>
  Array.isArray(value) && value.length <= count && value.every((item) => typeof item === 'string' && item.length <= length && !item.includes('\0'))
const numberIn = (value: unknown, min: number, max: number) =>
  typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max
const oneOf = (value: unknown, values: unknown[]) => values.includes(value)

/** Ignore unknown/host-only fields. Reject invalid writes; recover valid fields from old configs. */
export function validateConfig(value: unknown, strict = true): Partial<IConfig> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    if (strict) { throw new Error('Gallery configuration must be an object.') }
    return {}
  }
  const validators: Record<keyof Omit<IConfig, 'hostUiLanguage'>, (_value: unknown) => boolean> = {
    showImageTypes: (v) => stringList(v, IMAGE_FILE_PATTERNS.length, 10) && v.every((type) => IMAGE_FILE_PATTERNS.includes(`*${type}`)),
    keyword: (v) => typeof v === 'string' && v.length <= 8192,
    activeKey: stringList,
    backgroundColor: (v) => typeof v === 'string' && (oneOf(v, ['transparent', 'checkerboard']) || /^#[\da-f]{3,8}$/i.test(v)),
    size: (v) => numberIn(v, 1, 8192),
    imageGridColumns: (v) => numberIn(v, 1, 20) && Number.isInteger(v),
    includeFolders: (v) => stringList(v, 64, 512),
    excludeFolders: (v) => stringList(v, 64, 512),
    uiTheme: (v) => oneOf(v, ['follow', 'light', 'dark']),
    imageSort: (v) => oneOf(v, ['nameAsc', 'nameDesc', 'mtimeAsc', 'mtimeDesc', 'sizeAsc', 'sizeDesc', 'typeAsc', 'typeDesc']),
    galleryGroupByFolder: (v) => typeof v === 'boolean',
    galleryLayout: (v) => oneOf(v, ['grid', 'fill', 'list']),
    galleryCompact: (v) => typeof v === 'boolean',
    gallerySidebarVisible: (v) => typeof v === 'boolean',
    gallerySidebarWidth: (v) => numberIn(v, 160, 440),
    galleryIncludeSubfolders: (v) => typeof v === 'boolean',
    gallerySelectedFolder: (v) => typeof v === 'string' && v.length <= 32768 && !v.includes('\0'),
    galleryExpandedFolders: stringList,
    galleryListThumbSize: (v) => numberIn(v, 40, 160),
    galleryShowFileSize: (v) => typeof v === 'boolean'
  }
  const result: Partial<IConfig> = {}
  for (const key of Object.keys(validators) as Array<keyof typeof validators>) {
    if (!Object.prototype.hasOwnProperty.call(value, key)) { continue }
    const field = (value as Record<string, unknown>)[key]
    let valid = validators[key](field)
    if (valid && (key === 'includeFolders' || key === 'excludeFolders')) {
      try { compileFolderFilters(field as string[], []) } catch { valid = false }
    }
    if (!valid) {
      if (strict) { throw new Error(`Invalid gallery configuration field: ${key}.`) }
      continue
    }
    Object.assign(result, { [key]: field })
  }
  return result
}
