import React, { useMemo, useState } from 'react'
import { Button, Input } from 'antd'
import { compileFolderFilters, parseFolderFilterInput } from '../../folderFilterRules'

/** Draft mounted on expand; keyed by applied rules so external changes cannot leave a stale form. */
export const FolderFilterFields: React.FC<{
  includeFolders: string[]
  excludeFolders: string[]
  onApply: (_include: string[], _exclude: string[]) => void
}> = ({ includeFolders, excludeFolders, onApply }) => {
  const [includeDraft, setIncludeDraft] = useState(includeFolders.join('\n'))
  const [excludeDraft, setExcludeDraft] = useState(excludeFolders.join('\n'))
  const draft = useMemo(() => {
    const include = parseFolderFilterInput(includeDraft)
    const exclude = parseFolderFilterInput(excludeDraft)
    try {
      compileFolderFilters(include, exclude)
      return { include, exclude, error: '' }
    } catch (error) {
      return { include, exclude, error: error instanceof Error ? error.message : String(error) }
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
    <div className='iv-folder-filter-fields' aria-label='Folder scan filters'>
      <label>
        <span>folders to include</span>
        <Input.TextArea
          aria-label='Folders to include'
          value={includeDraft}
          onChange={(event) => setIncludeDraft(event.target.value)}
          onKeyDown={onKeyDown}
          autoSize={{ minRows: 1, maxRows: 3 }}
          placeholder='e.g. assets/**'
          spellCheck={false}
          status={draft.error ? 'error' : undefined}
        />
      </label>
      <label>
        <span>folders to exclude</span>
        <Input.TextArea
          aria-label='Folders to exclude'
          value={excludeDraft}
          onChange={(event) => setExcludeDraft(event.target.value)}
          onKeyDown={onKeyDown}
          autoSize={{ minRows: 1, maxRows: 3 }}
          placeholder='e.g. **/{dist,build}'
          spellCheck={false}
          status={draft.error ? 'error' : undefined}
        />
      </label>
      <small>Project-relative folders. One rule per line; Shift+Enter adds a line.</small>
      {draft.error && (
        <small role='alert' className='iv-folder-filter-error'>
          {draft.error}
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
          Clear
        </Button>
        <Button size='small' type='primary' disabled={!dirty || Boolean(draft.error)} onClick={apply}>
          Apply
        </Button>
      </div>
    </div>
  )
}
