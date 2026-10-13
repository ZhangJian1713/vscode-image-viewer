import {
  isManagedImageResourceUrl,
  listResourceCacheVersions,
  parseWebviewServiceWorkerContext,
  responseLooksLikeImage
} from './cacheModel'

describe('resource cache model', () => {
  test('recognizes and orders only versioned VS Code resource caches', () => {
    expect(
      listResourceCacheVersions([
        'vscode-resource-cache-6',
        'unrelated-cache',
        'vscode-resource-cache-4',
        'vscode-resource-cache-next'
      ])
    ).toEqual([
      { name: 'vscode-resource-cache-4', version: 4 },
      { name: 'vscode-resource-cache-6', version: 6 }
    ])
  })

  test('limits managed URLs to local WebView image resources', () => {
    expect(
      isManagedImageResourceUrl(
        'https://file+.cursor-resource.example/Users/me/photo.PNG?mtime=1',
        'cursor-resource.example'
      )
    ).toBe(true)
    expect(isManagedImageResourceUrl('vscode-webview-resource:/Users/me/photo.webp')).toBe(true)
    expect(
      isManagedImageResourceUrl(
        'https://file+.cursor-resource.example/extension/dist/app.js',
        'cursor-resource.example'
      )
    ).toBe(false)
    expect(
      isManagedImageResourceUrl(
        'https://example.com/photo.png',
        'cursor-resource.example'
      )
    ).toBe(false)
    // Unknown HTTPS authorities fail closed until the worker metadata becomes available.
    expect(isManagedImageResourceUrl('https://example.com/photo.png')).toBe(false)
  })

  test('derives the resource authority from the worker script URL', () => {
    expect(
      parseWebviewServiceWorkerContext(
        'https://webview.example/service-worker.js?v=7&vscode-resource-base-authority=cursor-resource.example&platform=electron'
      )
    ).toEqual({
      resourceBaseAuthority: 'cursor-resource.example'
    })
    expect(parseWebviewServiceWorkerContext('not a url')).toEqual({
      resourceBaseAuthority: null
    })
  })

  test('uses Content-Type as a second safety check when present', () => {
    const responseWithType = (contentType: string): Response =>
      ({ headers: { get: () => contentType } } as unknown) as Response
    expect(responseLooksLikeImage(responseWithType('image/png'))).toBe(true)
    expect(responseLooksLikeImage(responseWithType('text/plain'))).toBe(false)
    expect(responseLooksLikeImage(undefined)).toBe(true)
  })
})
