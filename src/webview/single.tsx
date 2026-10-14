import { registerWebview } from '@easy_vscode/webview'
import React from 'react'
import SingleImageViewer from './SingleImageViewer'
import { ResourceCacheBoundary } from './resourceCache/ResourceCacheBoundary'

const ResourceManagedSingleImageViewer: React.FC = () => (
  <ResourceCacheBoundary kind='single-editor'>
    <SingleImageViewer />
  </ResourceCacheBoundary>
)

registerWebview({ SingleImageViewer: ResourceManagedSingleImageViewer })
