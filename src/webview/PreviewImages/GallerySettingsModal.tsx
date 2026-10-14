import React from 'react'
import { Button, Modal, Select, Tabs, Typography } from 'antd'
import { ExportOutlined, GithubOutlined, MailOutlined } from '@ant-design/icons'
import type { IConfig } from '../../types'
import { MESSAGE_CMD } from '../../constants'
import { ANNOUNCEMENT_ID } from './announcementConfig'
import { callGalleryHost } from './galleryBridge'
import { useI18n, useLanguage } from '../../i18n/react'
import './gallerySettings.css'

import { FEEDBACK_EMAIL, FeedbackAction } from '../../feedback'
const openFeedback = (action: FeedbackAction) => callGalleryHost({ cmd: MESSAGE_CMD.OPEN_FEEDBACK, data: { action } })

export const GallerySettingsModal: React.FC<{
  config: IConfig
  onChange: (_patch: Partial<IConfig>) => void
  onClose: () => void
}> = ({ config, onChange, onClose }) => {
  const { t } = useI18n()
  const language = useLanguage()
  return (
    <Modal
      title={t('common.settings')}
      open
      onCancel={onClose}
      width={620}
      footer={
        <Button type='primary' onClick={onClose}>
          {t('common.done')}
        </Button>
      }
    >
      <Tabs
        className='iv-gallery-settings'
        items={[
          {
            key: 'general',
            label: t('language.general'),
            children: <div className='iv-settings-panel'>
              <div className='iv-settings-row'>
                <div>
                  <strong>{t('language.label')}</strong>
                  <Typography.Paragraph type='secondary'>{t('language.description')}</Typography.Paragraph>
                </div>
                <Select
                  aria-label={t('language.label')}
                  value={language.preference}
                  loading={language.saving}
                  disabled={language.saving}
                  options={[
                    { value: 'auto', label: t('language.follow') },
                    { value: 'en', label: 'English' },
                    { value: 'zh-CN', label: '简体中文' },
                    { value: 'zh-TW', label: '繁體中文' }
                  ]}
                  onChange={language.setPreference}
                />
              </div>
              {language.saveError && <Typography.Text type='danger' role='alert'>{t('language.saveFailed')}</Typography.Text>}
            </div>
          },
          {
            key: 'gallery',
            label: t('gallery.tab'),
            children: (
              <div className='iv-settings-panel'>
                <div className='iv-settings-row'>
                  <div>
                    <strong>{t('settings.fileSize')}</strong>
                    <Typography.Paragraph type='secondary'>
                      {t('settings.fileSizeDescription')}
                    </Typography.Paragraph>
                  </div>
                  <Select
                    aria-label={t('settings.fileSizeDisplay')}
                    value={config.galleryShowFileSize !== false ? 'caption' : 'hover'}
                    options={[
                      { value: 'caption', label: t('settings.belowName') },
                      { value: 'hover', label: t('settings.onHover') }
                    ]}
                    onChange={(value) => onChange({ galleryShowFileSize: value === 'caption' })}
                  />
                </div>
                <Typography.Text type='secondary'>
                  {t('settings.projectChanges')}
                </Typography.Text>
              </div>
            )
          },
          {
            key: 'feedback',
            label: t('feedback.tab'),
            children: (
              <div className='iv-settings-panel'>
                <div className='iv-feedback-card'>
                  <strong>
                    <GithubOutlined /> {t('feedback.report')}
                  </strong>
                  <Typography.Paragraph type='secondary'>
                    {t('feedback.description')}
                  </Typography.Paragraph>
                  <div className='iv-feedback-actions'>
                    <Button icon={<GithubOutlined />} onClick={() => openFeedback('issues')}>
                      {t('feedback.browse')}
                    </Button>
                    <Button type='primary' icon={<ExportOutlined />} onClick={() => openFeedback('newIssue')}>
                      {t('feedback.create')}
                    </Button>
                  </div>
                </div>
                <div className='iv-feedback-card'>
                  <strong>
                    <MailOutlined /> {t('feedback.email')}
                  </strong>
                  <Typography.Paragraph type='secondary'>{FEEDBACK_EMAIL}</Typography.Paragraph>
                  <Button
                    icon={<MailOutlined />}
                    onClick={() => openFeedback('email')}
                  >
                    {t('feedback.openEmail')}
                  </Button>
                </div>
                <Typography.Text type='secondary'>Image Viewer v{ANNOUNCEMENT_ID}</Typography.Text>
              </div>
            )
          }
        ]}
      />
    </Modal>
  )
}
