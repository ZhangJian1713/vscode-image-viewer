/**
 * File-name ordering compatible with VS Code Explorer's FileSorter.
 *
 * Kept local because VS Code's internal comparer is not part of the extension API:
 * https://github.com/microsoft/vscode/blob/main/src/vs/base/common/comparers.ts
 */

export type ExplorerSortOrder =
  | 'default'
  | 'mixed'
  | 'filesFirst'
  | 'type'
  | 'modified'
  | 'foldersNestsFiles'

export type ExplorerLexicographicOptions = 'default' | 'upper' | 'lower' | 'unicode'

export interface ExplorerImageSortOptions {
  sortOrder: ExplorerSortOrder
  lexicographicOptions: ExplorerLexicographicOptions
  reverse: boolean
}

export interface ExplorerImageSortEntry {
  name: string
  mtime?: number
}

const numericCollator = new Intl.Collator(undefined, { numeric: true })
const numericCaseInsensitiveCollator = new Intl.Collator(undefined, {
  numeric: true,
  sensitivity: 'accent'
})

function compareAndDisambiguateByLength(
  collator: Intl.Collator,
  one: string,
  other: string
): number {
  const result = collator.compare(one, other)
  if (result !== 0) {
    return result
  }
  if (one.length !== other.length) {
    return one.length < other.length ? -1 : 1
  }
  return 0
}

function startsWithLower(value: string): boolean {
  const character = value.charAt(0)
  return character.toLocaleUpperCase() !== character
}

function startsWithUpper(value: string): boolean {
  const character = value.charAt(0)
  return character.toLocaleLowerCase() !== character
}

function compareCaseUpperFirst(one: string, other: string): number {
  if (startsWithUpper(one) && startsWithLower(other)) {
    return -1
  }
  return startsWithLower(one) && startsWithUpper(other) ? 1 : 0
}

function compareCaseLowerFirst(one: string, other: string): number {
  if (startsWithLower(one) && startsWithUpper(other)) {
    return -1
  }
  return startsWithUpper(one) && startsWithLower(other) ? 1 : 0
}

function compareFileNames(
  one: string,
  other: string,
  lexicographicOptions: ExplorerLexicographicOptions
): number {
  if (lexicographicOptions === 'unicode') {
    if (one === other) {
      return 0
    }
    return one < other ? -1 : 1
  }

  const caseResult =
    lexicographicOptions === 'upper'
      ? compareCaseUpperFirst(one, other)
      : lexicographicOptions === 'lower'
      ? compareCaseLowerFirst(one, other)
      : 0

  return caseResult || compareAndDisambiguateByLength(numericCollator, one, other)
}

const fileNameMatch = /^(.*?)(\.([^.]*))?$/

function extractExtension(value: string): string {
  const match = fileNameMatch.exec(value)
  return (match && match[1] && match[1].charAt(0) !== '.' && match[3]) || ''
}

function compareFileExtensions(
  one: string,
  other: string,
  lexicographicOptions: ExplorerLexicographicOptions
): number {
  const oneExtension = extractExtension(one)
  const otherExtension = extractExtension(other)

  if (lexicographicOptions === 'unicode') {
    const oneLower = oneExtension.toLowerCase()
    const otherLower = otherExtension.toLowerCase()
    if (oneLower !== otherLower) {
      return oneLower < otherLower ? -1 : 1
    }
    if (one === other) {
      return 0
    }
    return one < other ? -1 : 1
  }

  const extensionResult = compareAndDisambiguateByLength(
    numericCaseInsensitiveCollator,
    oneExtension,
    otherExtension
  )
  if (extensionResult !== 0) {
    return extensionResult
  }

  const caseResult =
    lexicographicOptions === 'upper'
      ? compareCaseUpperFirst(one, other)
      : lexicographicOptions === 'lower'
      ? compareCaseLowerFirst(one, other)
      : 0

  return caseResult || compareAndDisambiguateByLength(numericCollator, one, other)
}

export function compareExplorerImageEntries(
  one: ExplorerImageSortEntry,
  other: ExplorerImageSortEntry,
  options: ExplorerImageSortOptions
): number {
  let result: number
  if (options.sortOrder === 'type') {
    result = compareFileExtensions(one.name, other.name, options.lexicographicOptions)
  } else if (options.sortOrder === 'modified' && one.mtime !== other.mtime) {
    result = (one.mtime ?? 0) < (other.mtime ?? 0) ? 1 : -1
  } else {
    result = compareFileNames(one.name, other.name, options.lexicographicOptions)
  }

  return options.reverse ? -result : result
}
