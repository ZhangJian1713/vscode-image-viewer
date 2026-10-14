import React from 'react'
import { Button, Modal, Select, Tabs, Typography } from 'antd'
import { ExportOutlined, GithubOutlined, MailOutlined } from '@ant-design/icons'
import type { IConfig } from '../../types'
import { MESSAGE_CMD } from '../../constants'
import { ANNOUNCEMENT_ID, ISSUES_URL } from './announcementConfig'
import { callGalleryHost } from './galleryBridge'
import './gallerySettings.css'

const FEEDBACK_EMAIL = 'zhangjian1713@gmail.com'
const openExternal = (url: string) => callGalleryHost({ cmd: MESSAGE_CMD.OPEN_EXTERNAL_URI, data: { url } })

export const GallerySettingsModal: React.FC<{
  config: IConfig
  onChange: (_patch: Partial<IConfig>) => void
  onClose: () => void
}> = ({ config, onChange, onClose }) => {
  return (
    <Modal
      title='Settings'
      open
      onCancel={onClose}
      width={620}
      footer={
        <Button type='primary' onClick={onClose}>
          Done
        </Button>
      }
    >
      <Tabs
        className='iv-gallery-settings'
        items={[
          {
            key: 'gallery',
            label: 'Gallery',
            children: (
              <div className='iv-settings-panel'>
                <div className='iv-settings-row'>
                  <div>
                    <strong>File size</strong>
                    <Typography.Paragraph type='secondary'>
                      Choose where to show file sizes in Fill and Grid. List keeps its size column; compact mode uses
                      hover details.
                    </Typography.Paragraph>
                  </div>
                  <Select
                    aria-label='Gallery file size display'
                    value={config.galleryShowFileSize !== false ? 'caption' : 'hover'}
                    options={[
                      { value: 'caption', label: 'Below file name' },
                      { value: 'hover', label: 'On hover' }
                    ]}
                    onChange={(value) => onChange({ galleryShowFileSize: value === 'caption' })}
                  />
                </div>
                <Typography.Text type='secondary'>
                  Changes apply immediately and are saved for this project.
                </Typography.Text>
              </div>
            )
          },
          {
            key: 'feedback',
            label: 'Feedback',
            children: (
              <div className='iv-settings-panel'>
                <div className='iv-feedback-card'>
                  <strong>
                    <GithubOutlined /> Report an issue or request a feature
                  </strong>
                  <Typography.Paragraph type='secondary'>
                    Check existing issues first. For a bug report, include your VS Code or Cursor version, operating
                    system, image format, and steps to reproduce it.
                  </Typography.Paragraph>
                  <div className='iv-feedback-actions'>
                    <Button icon={<GithubOutlined />} onClick={() => openExternal(ISSUES_URL)}>
                      Browse issues
                    </Button>
                    <Button type='primary' icon={<ExportOutlined />} onClick={() => openExternal(`${ISSUES_URL}/new`)}>
                      Create an issue
                    </Button>
                  </div>
                </div>
                <div className='iv-feedback-card'>
                  <strong>
                    <MailOutlined /> Send feedback by email
                  </strong>
                  <Typography.Paragraph type='secondary'>{FEEDBACK_EMAIL}</Typography.Paragraph>
                  <Button
                    icon={<MailOutlined />}
                    onClick={() =>
                      openExternal(
                        `mailto:${FEEDBACK_EMAIL}?subject=${encodeURIComponent(
                          `Image Viewer v${ANNOUNCEMENT_ID} feedback`
                        )}`
                      )
                    }
                  >
                    Open email app
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
