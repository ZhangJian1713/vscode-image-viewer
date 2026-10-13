import { registerWebview } from '@easy_vscode/webview'
import React from 'react'
import PreviewImages from './PreviewImages'
import SingleImageViewer from './SingleImageViewer'
import { AntdWebviewShell } from './AntdWebviewShell'
import { ResourceCacheBoundary } from './resourceCache/ResourceCacheBoundary'

const ResourceManagedPreviewImages: React.FC = () => (
  <ResourceCacheBoundary kind='gallery'>
    <PreviewImages />
  </ResourceCacheBoundary>
)

const ResourceManagedSingleImageViewer: React.FC = () => (
  <ResourceCacheBoundary kind='single-editor'>
    <SingleImageViewer />
  </ResourceCacheBoundary>
)

const webviewComponents = {
  PreviewImages: ResourceManagedPreviewImages,
  SingleImageViewer: ResourceManagedSingleImageViewer
}

registerWebview(webviewComponents, { Root: AntdWebviewShell })
