import React from 'react'
import { FolderOutlined } from '@ant-design/icons'
import { folderHudModel, folderHudPosition } from './galleryViewportFolders'
import './scrollbarFolders.css'

export const ScrollbarFolderHud: React.FC<{
  paths: string[]
  root: string
  top: number
  contentHeight: number
  height: number
  visible: boolean
}> = ({ paths, root, top, contentHeight, height, visible }) => {
  if (!paths.length || !height) {
    return null
  }
  const model = folderHudModel(paths, root, height)
  const position = folderHudPosition(top, contentHeight, height, model.height)
  return (
    <div className={`iv-scroll-folder-hud ${visible ? 'is-visible' : ''}`}
      style={{ top: position.top }} aria-hidden='true' data-folder-count={paths.length}>
      <span className='iv-scroll-folder-caret' style={{ top: position.caret }} />
      {model.header && <strong>{model.header}</strong>}
      <ol>
        {model.head.map((path) => <li key={path}><FolderOutlined /><span>{path}</span></li>)}
        {model.omitted && <li className='iv-scroll-folder-ellipsis'>⋮</li>}
        {model.tail.map((path) => <li key={path}><FolderOutlined /><span>{path}</span></li>)}
      </ol>
    </div>
  )
}
