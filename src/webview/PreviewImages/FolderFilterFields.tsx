import React, { useMemo, useState } from 'react'
import { Button, Input } from 'antd'
import { compileFolderFilters, FolderFilterError, parseFolderFilterInput } from '../../folderFilterRules'
import { useI18n } from '../../i18n/react'

/** Draft mounted on expand; keyed by applied rules so external changes cannot leave a stale form. */
export const FolderFilterFields: React.FC<{
  includeFolders: string[]
  excludeFolders: string[]
  onApply: (_include: string[], _exclude: string[]) => void
}> = ({ includeFolders, excludeFolders, onApply }) => {
  const { t } = useI18n()
  const [includeDraft, setIncludeDraft] = useState(includeFolders.join('\n'))
  const [excludeDraft, setExcludeDraft] = useState(excludeFolders.join('\n'))
  const draft = useMemo(() => {
    const include = parseFolderFilterInput(includeDraft)
    const exclude = parseFolderFilterInput(excludeDraft)
    try {
      compileFolderFilters(include, exclude)
      return { include, exclude, error: null as Error | null }
    } catch (error) {
      return { include, exclude, error: error instanceof Error ? error : new Error(String(error)) }
    }
  }, [includeDraft, excludeDraft])
  const dirty = JSON.stringify([draft.include, draft.exclude]) !== JSON.stringify([includeFolders, excludeFolders])
  const apply = () => {
    if (!draft.error && dirty) {
      onApply(draft.include, draft.exclude)
    }
  }
  const onKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault()
      apply()
    }
  }
  return (
    <div className='iv-folder-filter-fields' aria-label={t('filters.region')}>
      <label>
        <span>{t('filters.include')}</span>
        <Input.TextArea
          aria-label={t('filters.include')}
          value={includeDraft}
          onChange={(event) => setIncludeDraft(event.target.value)}
          onKeyDown={onKeyDown}
          autoSize={{ minRows: 1, maxRows: 3 }}
          placeholder={t('filters.includeHint')}
          spellCheck={false}
          status={draft.error ? 'error' : undefined}
        />
      </label>
      <label>
        <span>{t('filters.exclude')}</span>
        <Input.TextArea
          aria-label={t('filters.exclude')}
          value={excludeDraft}
          onChange={(event) => setExcludeDraft(event.target.value)}
          onKeyDown={onKeyDown}
          autoSize={{ minRows: 1, maxRows: 3 }}
          placeholder={t('filters.excludeHint')}
          spellCheck={false}
          status={draft.error ? 'error' : undefined}
        />
      </label>
      <small>{t('filters.help')}</small>
      {draft.error && (
        <small role='alert' className='iv-folder-filter-error'>
          {draft.error instanceof FolderFilterError
            ? t(draft.error.key, { pattern: draft.error.pattern })
            : t('common.actionFailed')}
        </small>
      )}
      <div className='iv-folder-filter-actions'>
        <Button
          size='small'
          type='text'
          disabled={!includeDraft && !excludeDraft}
          onClick={() => {
            setIncludeDraft('')
            setExcludeDraft('')
          }}
        >
          {t('common.clear')}
        </Button>
        <Button size='small' type='primary' disabled={!dirty || Boolean(draft.error)} onClick={apply}>
          {t('common.apply')}
        </Button>
      </div>
    </div>
  )
}
