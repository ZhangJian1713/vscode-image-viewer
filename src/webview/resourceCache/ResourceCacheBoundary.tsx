import { callVscode } from '@easy_vscode/webview'
import { BUILTIN_MESSAGE_CMD } from '@easy_vscode/core/lib/constants'
import React, { createContext, useContext, useEffect, useMemo, useRef } from 'react'
import {
  MESSAGE_CMD,
  RESOURCE_CACHE_CLEANUP_ARG
} from '../../constants'
import { ResourceLeaseKind } from './leaseStore'
import {
  ResourceCacheCleanupResult,
  ResourceCacheManager
} from './resourceCacheManager'

/* eslint-disable no-unused-vars -- callback parameter names document the context contract */

type ResourceCacheContextValue = {
  retain: (url: string) => () => void
  setSlot: (slot: string, url: string | null | undefined) => void
}
/* eslint-enable no-unused-vars */

const ResourceCacheContext = createContext<ResourceCacheContextValue | null>(null)

type WindowWithCommandArgs = Window & { commandArgs?: unknown[] }

function argsRequestCleanup(args: unknown[] | undefined): boolean {
  const value = args?.[0]
  return Boolean(
    value &&
      typeof value === 'object' &&
      (value as Record<string, unknown>)[RESOURCE_CACHE_CLEANUP_ARG] === true
  )
}

function reportExplicitCleanup(
  result: ResourceCacheCleanupResult | null,
  error?: unknown
): void {
  callVscode({
    cmd: MESSAGE_CMD.RESOURCE_CACHE_CLEANUP_RESULT,
    data: error
      ? { ok: false, error: error instanceof Error ? error.message : String(error) }
      : { ok: true, ...result }
  })
}

export function ResourceCacheBoundary({
  children,
  kind
}: {
  children: React.ReactNode
  kind: ResourceLeaseKind
}): React.ReactElement {
  const manager = useMemo(() => new ResourceCacheManager(kind), [kind])
  const explicitCleanupRunning = useRef<Promise<void> | null>(null)

  useEffect(() => {
    let mounted = true
    const initialForceCleanup =
      kind === 'gallery' &&
      argsRequestCleanup((window as WindowWithCommandArgs).commandArgs)

    const runExplicitCleanup = (): Promise<void> => {
      if (explicitCleanupRunning.current) {
        return explicitCleanupRunning.current
      }
      const task = manager
        .forceClearAll()
        .then((result) => reportExplicitCleanup(result))
        .catch((error) => reportExplicitCleanup(null, error))
        .then(() => {
          explicitCleanupRunning.current = null
        })
      explicitCleanupRunning.current = task
      return task
    }

    const onMessage = (event: MessageEvent): void => {
      if (event.data?.cmd !== BUILTIN_MESSAGE_CMD.REVEAL_WEBVIEW) {
        return
      }
      if (kind === 'gallery' && argsRequestCleanup(event.data?.data?.commandArgs)) {
        void runExplicitCleanup()
      }
    }

    window.addEventListener('message', onMessage)
    void manager.initialize(initialForceCleanup).then(
      (result) => {
        if (mounted && initialForceCleanup) {
          reportExplicitCleanup(result)
        }
      },
      (error) => {
        if (mounted && initialForceCleanup) {
          reportExplicitCleanup(null, error)
        }
      }
    )

    return () => {
      mounted = false
      window.removeEventListener('message', onMessage)
      manager.destroy()
    }
  }, [kind, manager])

  const value = useMemo<ResourceCacheContextValue>(
    () => ({
      retain: (url) => manager.retain(url),
      setSlot: (slot, url) => manager.setSlot(slot, url)
    }),
    [manager]
  )

  return (
    <ResourceCacheContext.Provider value={value}>
      {children}
    </ResourceCacheContext.Provider>
  )
}

export function useRetainedResourceUrl(
  url: string | null | undefined,
  active: boolean = true
): void {
  const context = useContext(ResourceCacheContext)
  useEffect(() => {
    if (!context || !active || !url) {
      return
    }
    return context.retain(url)
  }, [active, context, url])
}

export function useResourceCacheSlot(
  slot: string,
  url: string | null | undefined
): void {
  const context = useContext(ResourceCacheContext)
  useEffect(() => {
    if (!context) {
      return
    }
    context.setSlot(slot, url)
    return () => context.setSlot(slot, null)
  }, [context, slot, url])
}
