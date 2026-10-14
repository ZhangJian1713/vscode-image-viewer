export type { LocaleStrings } from './localeTypes';

import type { LocaleStrings } from './localeTypes';
import { enStrings } from './locales/en';
import { zhStrings } from './locales/zh';

/** Built-in locale map. Extend or override via the `language` prop. */
const LOCALES: Record<string, LocaleStrings> = {
  en: enStrings,
  zh: zhStrings,
};

/**
 * Resolve a {@link LocaleStrings} object from a BCP 47 language tag.
 *
 * Matching is done on the primary subtag only (`zh-CN` → `zh`).
 * Falls back to English for any unrecognised locale.
 *
 * @param language – e.g. `"en"`, `"en-US"`, `"zh"`, `"zh-CN"`
 */
export function resolveStrings(language?: string): LocaleStrings {
  if (!language) return enStrings;
  const primary = language.split(/[-_]/)[0].toLowerCase();
  return LOCALES[primary] ?? enStrings;
}
