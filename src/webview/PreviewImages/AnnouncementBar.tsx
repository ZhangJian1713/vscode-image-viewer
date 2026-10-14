import { BulbOutlined, GithubOutlined, StarOutlined, ExportOutlined } from '@ant-design/icons'
import { callGalleryHost } from './galleryBridge'
import { Button, Modal, Space } from 'antd'
import React, { useCallback, useEffect, useMemo, useState } from 'react'

import type { FeedbackAction } from '../../feedback'
import { MESSAGE_CMD } from '../../constants'
import {
  ANNOUNCEMENT_DISMISS_STORAGE_KEY,
  ANNOUNCEMENT_ID,
  getAnnouncementBarTopStrings,
  getAnnouncementStrings,
} from './announcementConfig'

function openFeedback(action: FeedbackAction): void {
  callGalleryHost({ cmd: MESSAGE_CMD.OPEN_FEEDBACK, data: { action } })
}

export type AnnouncementBarProps = {
  /** Resolved application language shared by the bar and modal. */
  hostUiLanguage?: string
}

/**
 * Top bar: version + CTA (opens modal); Issues / Star on the right. Unread users get the modal once; after dismiss, open via bar only.
 */
export const AnnouncementBar: React.FC<AnnouncementBarProps> = ({ hostUiLanguage }) => {

  const [modalOpen, setModalOpen] = useState(false)
  const barTop = useMemo(() => getAnnouncementBarTopStrings(hostUiLanguage), [hostUiLanguage])
  const modalCopy = useMemo(() => getAnnouncementStrings(hostUiLanguage), [hostUiLanguage])

  const persistDismiss = useCallback(() => {
    try {
      localStorage.setItem(ANNOUNCEMENT_DISMISS_STORAGE_KEY, ANNOUNCEMENT_ID)
    } catch {
      //
    }
  }, [])

  const closeModal = useCallback(() => {
    persistDismiss()
    setModalOpen(false)
  }, [persistDismiss])

  useEffect(() => {
    try {
      const dismissed = localStorage.getItem(ANNOUNCEMENT_DISMISS_STORAGE_KEY)
      if (dismissed !== ANNOUNCEMENT_ID) {
        setModalOpen(true)
      }
    } catch {
      setModalOpen(true)
    }
  }, [])

  return (
    <>
      <div className='iv-announcement-bar'>
        <Button
          type='text'
          size='small'
          className='iv-announcement-bar__left'
          icon={<BulbOutlined />}
          onClick={() => setModalOpen(true)}
          aria-label={barTop.openReleaseNotesAria}
        >
          <span className='iv-announcement-bar__version'>v{ANNOUNCEMENT_ID}</span>
          <span className='iv-announcement-bar__cta'>{barTop.barCta}</span>
          <span className='iv-announcement-bar__hint'>{barTop.barHint}</span>
        </Button>
        <Space size={4} className='iv-announcement-bar__right'>
          <Button
            type='text'
            size='small'
            className='iv-community-link'
            icon={<GithubOutlined />}
            aria-label={"Open GitHub issues"}
            onClick={() => openFeedback('issues')}
          >
            {"Browse issues"} <ExportOutlined className='iv-community-external' />
          </Button>
          <Button
            type='text'
            size='small'
            className='iv-community-link'
            icon={<StarOutlined />}
            aria-label={"Open GitHub repository"}
            onClick={() => openFeedback('repository')}
          >
            {"Star"} <ExportOutlined className='iv-community-external' />
          </Button>
        </Space>
      </div>

      <Modal
        title={modalCopy.modalTitle}
        open={modalOpen}
        onCancel={closeModal}
        footer={[
          <Button key='close' type='primary' onClick={closeModal}>
            {modalCopy.closeButton}
          </Button>
        ]}
        width={560}
      >
        <div className='iv-announcement-details'>
          <ul className='iv-announcement-feature-list'>
            {modalCopy.updates.map(({ kind, text }, index) => (
              <li key={index}>
                <strong className='iv-announcement-category'>{modalCopy.categoryLabels[kind]}</strong>
                {text}
              </li>
            ))}
          </ul>
          <p className='iv-announcement-feedback'>{modalCopy.feedbackInvitation}</p>
        </div>
      </Modal>
    </>
  )
}
