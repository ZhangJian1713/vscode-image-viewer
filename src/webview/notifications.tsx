import React from 'react'
import { message } from 'antd'
import { TranslatedText } from '../i18n/react'

/** Keep live text consumers inside imperative Ant Design roots, including already-open toasts. */
export function notifyActionResult(error?: string): void {
  if (error !== undefined) {
    message.error(<span><TranslatedText message='common.actionFailed' />
      {error && <small style={{ display: 'block' }}><TranslatedText message='common.technicalDetail' values={{ detail: error }} /></small>}
    </span>)
  } else {
    message.success(<TranslatedText message='common.copied' />)
  }
}
