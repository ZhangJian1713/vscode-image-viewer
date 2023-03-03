import { Dropdown, Menu, message } from 'antd'
import { callVscode } from '@easy_vscode/webview'
import React from 'react'
import { MESSAGE_CMD } from '../../../constants'
import { StyleImageInfo, StyleImageName } from './style'
import { CopyOutlined, DeleteOutlined } from '@ant-design/icons'

enum MenuKeys {
  CopyFileName,
  CopyPath,
  CopyBase64,
  DeleteFile
}

const THEME_COLOR = '#2673DD'

const ImageInfo: React.FC<any> = ({ img, onDeleteImage, size }) => {
  const onClickCopyBase64 = () => {
    callVscode({ cmd: MESSAGE_CMD.GET_IMAGE_BASE64, data: { filePath: img.fullPath } }, (strBase64: string) => {
      copy(strBase64, false)
      message.success('Successfully copied Base64 encoding of the image')
    })
  }
  const onClickDelete = () => {
    callVscode({ cmd: MESSAGE_CMD.DELETE_FILE, data: { filePath: img.fullPath } }, () => {
      message.success('Successfully deleted')
      onDeleteImage(img.fullPath)
    })
  }
  const copy = (copyText: string, showMsg: boolean = true) => {
    navigator.clipboard.writeText(copyText).then(() => showMsg && message.success(`Successfully copied "${copyText}"`))
  }
  const eventHandler = {
    [MenuKeys.CopyFileName]: () => copy(img.fileName),
    [MenuKeys.CopyPath]: () => copy(img.path),
    [MenuKeys.CopyBase64]: onClickCopyBase64,
    [MenuKeys.DeleteFile]: onClickDelete
  }
  const handleMenuClick = (e) => {
    const handler = eventHandler[e.key]
    if (handler) {
      handler()
    }
  }
  const menu = (
    <Menu
      onClick={handleMenuClick}
      items={[
        {
          label: `Copy "${img.fileName}"`,
          key: MenuKeys.CopyFileName,
          icon: <CopyOutlined style={{ color: THEME_COLOR }} />
        },
        {
          label: `Copy "${img.path}"`,
          key: MenuKeys.CopyPath,
          icon: <CopyOutlined style={{ color: THEME_COLOR }} />
        },
        {
          label: `Copy Base64 encoding of this image`,
          key: MenuKeys.CopyBase64,
          icon: <CopyOutlined style={{ color: THEME_COLOR }} />
        },
        {
          label: 'Delete File',
          key: MenuKeys.DeleteFile,
          icon: <DeleteOutlined style={{ color: THEME_COLOR }} />
        }
      ]}
    />
  )
  const limitLength = Math.round(size / 4)
  let displayName
  if (size <= 10) {
    displayName = '..'
  } else if (size <= 15) {
    displayName = img.fileName[0] + '\n...'
  } else {
    const tooLong = img.fileName.length > limitLength
    if (!tooLong) {
      displayName = img.fileName
    } else if (limitLength >= 9) {
      displayName = img.fileName.substr(0, limitLength - 6) + '...' + img.fileType
    } else {
      displayName = img.fileName.substr(0, limitLength - 3) + '...'
    }
  }
  return (
    <StyleImageInfo>
      <Dropdown overlay={menu}>
        <StyleImageName style={{ width: `${size}px` }}>{displayName}</StyleImageName>
      </Dropdown>
    </StyleImageInfo>
  )
}

export default ImageInfo
