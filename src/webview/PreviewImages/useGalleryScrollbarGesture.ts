import { useCallback, useEffect, useRef, useState } from 'react'
import type { RefObject } from 'react'

/** 原生滚动条可能不派发 pointerdown；大跳变作为回退，明确排除滚轮、键盘和布局恢复。 */
export function useGalleryScrollbarGesture(rootRef: RefObject<HTMLDivElement>, enabled: boolean, resetKey: unknown) {
  const [state, setState] = useState({ dragging: false, hudVisible: false })
  const tracking = useRef({ active: false, held: false, top: 0, wheelAt: -Infinity, keyAt: -Infinity })
  const pauseTimer = useRef<ReturnType<typeof setTimeout>>()
  const hideTimer = useRef<ReturnType<typeof setTimeout>>()
  const releaseFrame = useRef(0)
  const suppressUntil = useRef(0)

  const finish = useCallback((hideImmediately = false) => {
    clearTimeout(pauseTimer.current)
    clearTimeout(hideTimer.current)
    cancelAnimationFrame(releaseFrame.current)
    releaseFrame.current = 0
    tracking.current.held = false
    tracking.current.active = false
    setState((old) => !old.dragging && old.hudVisible === !hideImmediately ? old : { dragging: false, hudVisible: !hideImmediately })
    if (!hideImmediately) {
      hideTimer.current = setTimeout(() => setState({ dragging: false, hudVisible: false }), 600)
    }
  }, [])
  const activate = useCallback(() => {
    clearTimeout(pauseTimer.current)
    clearTimeout(hideTimer.current)
    tracking.current.active = true
    setState((old) => old.dragging && old.hudVisible ? old : { dragging: true, hudVisible: true })
    // 没有可观察到释放事件的平台仍会在停顿后结束，不留下永久 HUD。
    if (!tracking.current.held) {
      pauseTimer.current = setTimeout(() => finish(), 600)
    }
  }, [finish])

  useEffect(() => {
    const root = rootRef.current
    finish(true)
    tracking.current.top = root?.scrollTop || 0
    if (!enabled || !root) {
      return
    }
    const down = (event: MouseEvent) => {
      if (event.button !== 0 || event.target !== root) {
        return
      }
      const rect = root.getBoundingClientRect()
      if (event.clientX < rect.right - Math.max(14, root.offsetWidth - root.clientWidth)) {
        return
      }
      tracking.current.held = true
      if (root.scrollHeight > root.clientHeight) {
        activate()
      }
    }
    const release = () => {
      if (!tracking.current.active) {
        tracking.current.held = false
        return
      }
      cancelAnimationFrame(releaseFrame.current)
      releaseFrame.current = requestAnimationFrame(() => finish())
    }
    const wheel = () => {
      tracking.current.wheelAt = performance.now()
      finish(true)
    }
    const key = () => { tracking.current.keyAt = performance.now() }
    const blur = () => finish(true)
    const visibility = () => { if (document.hidden) { blur() } }
    root.addEventListener('mousedown', down, true)
    root.addEventListener('wheel', wheel, { passive: true })
    window.addEventListener('keydown', key, true)
    window.addEventListener('pointerup', release, true)
    window.addEventListener('mouseup', release, true)
    window.addEventListener('pointercancel', release, true)
    window.addEventListener('blur', blur)
    window.addEventListener('pagehide', blur)
    document.addEventListener('visibilitychange', visibility)
    return () => {
      clearTimeout(pauseTimer.current)
      clearTimeout(hideTimer.current)
      cancelAnimationFrame(releaseFrame.current)
      root.removeEventListener('mousedown', down, true)
      root.removeEventListener('wheel', wheel)
      window.removeEventListener('keydown', key, true)
      window.removeEventListener('pointerup', release, true)
      window.removeEventListener('mouseup', release, true)
      window.removeEventListener('pointercancel', release, true)
      window.removeEventListener('blur', blur)
      window.removeEventListener('pagehide', blur)
      document.removeEventListener('visibilitychange', visibility)
    }
  }, [rootRef, enabled, resetKey, activate, finish])

  const onScroll = useCallback((top: number) => {
    const previous = tracking.current.top
    tracking.current.top = top
    const now = performance.now()
    if (!enabled || now < suppressUntil.current) {
      return
    }
    const input = tracking.current
    if (!input.held && (now - input.wheelAt < 200 || now - input.keyAt < 250)) {
      return
    }
    if (input.active || input.held || Math.abs(top - previous) > Math.max(100, (rootRef.current?.clientHeight || 0) * 0.65)) {
      activate()
    }
  }, [rootRef, enabled, activate])
  const suppressLayoutScroll = useCallback(() => { suppressUntil.current = performance.now() + 100 }, [])
  return { ...state, onScroll, suppressLayoutScroll }
}
