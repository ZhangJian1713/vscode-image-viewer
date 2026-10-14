import { useEffect, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent, MouseEvent as ReactMouseEvent } from 'react'

interface GestureOptions {
  enabled: boolean
  resourceKey: string
  mode: 'fit' | 'native'
  onCycle: (_point: { x: number; y: number }) => void
  onPanStart: (_event: ReactPointerEvent) => void
  onPanMove: (_event: ReactPointerEvent) => void
  onPanEnd: (_event?: ReactPointerEvent) => void
}

/** 单击和拖动共享一个 pointer 会话；放大后本次按压不能再转成 pan。 */
export function useClickZoomGesture(options: GestureOptions) {
  const latest = useRef(options)
  latest.current = options
  const session = useRef<{
    id: number
    down: ReactPointerEvent
    phase: 'zoomed' | 'pending' | 'dragging'
    suppressZoom: boolean
  }>()
  const lastPress = useRef<{ time: number; x: number; y: number }>()
  const consumedAt = useRef(0)
  const [dragging, setDragging] = useState(false)

  const finish = (event?: PointerEvent | ReactPointerEvent, cancelled = true) => {
    const current = session.current
    if (!current || (event && event.pointerId !== current.id)) {
      return
    }
    session.current = undefined
    if (current.phase === 'dragging') {
      latest.current.onPanEnd((event || current.down) as ReactPointerEvent)
    } else if (!cancelled && current.phase === 'pending' && !current.suppressZoom) {
      latest.current.onCycle({ x: current.down.clientX, y: current.down.clientY })
    }
    consumedAt.current = Date.now()
    setDragging(false)
    const target = current.down.currentTarget as HTMLElement
    if (target.hasPointerCapture?.(current.id)) {
      target.releasePointerCapture(current.id)
    }
  }
  const finishRef = useRef(finish)
  finishRef.current = finish

  useEffect(() => {
    const up = (event: PointerEvent) => finishRef.current(event, false)
    const cancel = (event: PointerEvent) => finishRef.current(event)
    const blur = () => finishRef.current()
    const hide = () => { if (document.hidden) { blur() } }
    window.addEventListener('pointerup', up, true)
    window.addEventListener('pointercancel', cancel, true)
    window.addEventListener('blur', blur)
    document.addEventListener('visibilitychange', hide)
    return () => {
      blur()
      window.removeEventListener('pointerup', up, true)
      window.removeEventListener('pointercancel', cancel, true)
      window.removeEventListener('blur', blur)
      document.removeEventListener('visibilitychange', hide)
    }
  }, [])
  useEffect(() => {
    finishRef.current()
    lastPress.current = undefined
  }, [options.resourceKey, options.enabled])

  return {
    dragging,
    onPointerDown(event: ReactPointerEvent) {
      if (!latest.current.enabled || event.pointerType !== 'mouse') {
        latest.current.onPanStart(event)
        return
      }
      if (event.button !== 0 || event.isPrimary === false) {
        return
      }
      finishRef.current()
      event.preventDefault()
      event.stopPropagation()
      const previous = lastPress.current
      const suppressZoom = Boolean(previous && Date.now() - previous.time < 350 &&
        Math.hypot(event.clientX - previous.x, event.clientY - previous.y) <= 4)
      lastPress.current = { time: Date.now(), x: event.clientX, y: event.clientY }
      // SyntheticEvent.currentTarget 在分发后会被清空，保存原元素身份供跨事件清理。
      const down = { ...event, currentTarget: event.currentTarget, target: event.currentTarget, nativeEvent: event.nativeEvent }
      session.current = { id: event.pointerId, down, phase: latest.current.mode === 'fit' ? 'zoomed' : 'pending', suppressZoom }
      event.currentTarget.setPointerCapture?.(event.pointerId)
      if (latest.current.mode === 'fit' && !suppressZoom) {
        latest.current.onCycle({ x: event.clientX, y: event.clientY })
      }
      consumedAt.current = Date.now()
    },
    onPointerMove(event: ReactPointerEvent) {
      const current = session.current
      if (!current) {
        if (!latest.current.enabled || event.pointerType !== 'mouse') {
          latest.current.onPanMove(event)
        }
        return
      }
      if (event.pointerId !== current.id) {
        return
      }
      if (!(event.buttons & 1)) {
        finishRef.current(event)
        return
      }
      event.preventDefault()
      event.stopPropagation()
      if (current.phase === 'pending' && Math.hypot(event.clientX - current.down.clientX, event.clientY - current.down.clientY) > 4) {
        current.phase = 'dragging'
        lastPress.current = undefined
        latest.current.onPanStart(current.down)
        setDragging(true)
      }
      if (current.phase === 'dragging') {
        latest.current.onPanMove(event)
      }
    },
    onPointerUp(event: ReactPointerEvent) {
      if (session.current) {
        finishRef.current(event, false)
      } else if (!latest.current.enabled || event.pointerType !== 'mouse') {
        latest.current.onPanEnd(event)
      }
    },
    onPointerCancel(event: ReactPointerEvent) {
      finishRef.current(event)
      if (!latest.current.enabled || event.pointerType !== 'mouse') {
        latest.current.onPanEnd(event)
      }
    },
    onClickCapture(event: ReactMouseEvent) {
      if (Date.now() - consumedAt.current < 500 && !(event.target as HTMLElement).closest('button,input,select')) {
        consumedAt.current = 0
        event.preventDefault()
        event.stopPropagation()
      }
    }
  }
}
