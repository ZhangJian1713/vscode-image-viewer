import { callVscode, registerWebview } from '@easy_vscode/webview'
import React from 'react'
import SingleImageViewer from './SingleImageViewer'
import { ResourceCacheBoundary } from './resourceCache/ResourceCacheBoundary'
import { LanguageProvider } from '../i18n/react'

const ResourceManagedSingleImageViewer: React.FC = () => (
  <LanguageProvider transport={callVscode}>
  <ResourceCacheBoundary kind='single-editor'>
    <SingleImageViewer />
  </ResourceCacheBoundary>
  </LanguageProvider>
)

registerWebview({ SingleImageViewer: ResourceManagedSingleImageViewer })
