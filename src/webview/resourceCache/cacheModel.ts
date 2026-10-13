const RESOURCE_CACHE_RE = /^vscode-resource-cache-(\d+)$/

const MANAGED_IMAGE_EXTENSIONS = new Set([
  '.svg',
  '.png',
  '.jpeg',
  '.jpg',
  '.ico',
  '.gif',
  '.webp',
  '.bmp',
  '.tif',
  '.tiff',
  '.apng',
  '.avif'
])

export type ResourceCacheVersion = {
  name: string
  version: number
}

export type WebviewServiceWorkerContext = {
  resourceBaseAuthority: string | null
}

export function parseResourceCacheName(name: string): ResourceCacheVersion | null {
  const match = RESOURCE_CACHE_RE.exec(name)
  if (!match) {
    return null
  }
  return { name, version: Number(match[1]) }
}

export function listResourceCacheVersions(names: string[]): ResourceCacheVersion[] {
  return names
    .map(parseResourceCacheName)
    .filter((entry): entry is ResourceCacheVersion => entry !== null)
    .sort((one, other) => one.version - other.version)
}

/**
 * VS Code passes its resource authority on the service worker registration URL. Extension
 * content runs in an inner fake.html frame, so its own location.search does not contain this
 * value; read it from the controlling worker URL instead.
 */
export function parseWebviewServiceWorkerContext(
  scriptUrl: string | null | undefined
): WebviewServiceWorkerContext {
  if (!scriptUrl) {
    return { resourceBaseAuthority: null }
  }
  try {
    const url = new URL(scriptUrl)
    const rawAuthority = url.searchParams.get('vscode-resource-base-authority')
    return {
      resourceBaseAuthority: rawAuthority?.trim().toLowerCase() || null
    }
  } catch {
    return { resourceBaseAuthority: null }
  }
}

function safePathname(url: URL): string {
  try {
    return decodeURIComponent(url.pathname).toLowerCase()
  } catch {
    return url.pathname.toLowerCase()
  }
}

/**
 * Only VS Code's local WebView resource URLs are eligible for deletion. Remote images and
 * unrelated CacheStorage entries must never be treated as extension-owned resources.
 */
export function isManagedImageResourceUrl(
  rawUrl: string,
  resourceBaseAuthority?: string | null
): boolean {
  let url: URL
  try {
    url = new URL(rawUrl)
  } catch {
    return false
  }

  const normalizedAuthority = resourceBaseAuthority?.trim().toLowerCase()
  // Fail closed if worker metadata is temporarily unavailable. Periodic GC resolves the
  // controller again on every pass, while accepting an arbitrary HTTPS host here could delete
  // a remote image that merely happens to share the resource-cache container.
  const isCurrentResourceHost =
    url.protocol === 'https:' &&
    Boolean(
      normalizedAuthority &&
        (url.hostname === normalizedAuthority ||
          url.hostname.endsWith(`.${normalizedAuthority}`))
    )
  const isLegacyResourceScheme =
    url.protocol === 'vscode-resource:' || url.protocol === 'vscode-webview-resource:'
  if (!isCurrentResourceHost && !isLegacyResourceScheme) {
    return false
  }

  const pathname = safePathname(url)
  for (const extension of MANAGED_IMAGE_EXTENSIONS) {
    if (pathname.endsWith(extension)) {
      return true
    }
  }
  return false
}

export function responseLooksLikeImage(response: Response | undefined): boolean {
  if (!response) {
    return true
  }
  const contentType = response.headers.get('content-type')
  return !contentType || contentType.toLowerCase().startsWith('image/')
}
