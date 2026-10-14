import { registerWebview } from '@easy_vscode/webview'
import React from 'react'
import PreviewImages from './PreviewImages'
import { AntdWebviewShell } from './AntdWebviewShell'
import { ResourceCacheBoundary } from './resourceCache/ResourceCacheBoundary'

const ResourceManagedPreviewImages: React.FC = () => (
  <ResourceCacheBoundary kind='gallery'>
    <PreviewImages />
  </ResourceCacheBoundary>
)

const webviewComponents = {
  PreviewImages: ResourceManagedPreviewImages
}

if (process.env.NODE_ENV === 'development' && /^https?:$/.test(location.protocol) && new URLSearchParams(location.search).get('mock') === '1') {
  // Explicit opt-in; Webpack removes this fixture branch from production bundles.
  require('./PreviewImages/browserMock').installGalleryMock()
}

registerWebview(webviewComponents, { Root: AntdWebviewShell })
