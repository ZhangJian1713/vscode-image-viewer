import { useEffect } from 'react'
import type { RefObject } from 'react'
import { GalleryGeometry, galleryLogicalScrollTop, galleryPhysicalScrollTop, galleryScrollHeight } from './galleryLayout'

/** 压缩滚动空间只改变 thumb 的范围；滚轮和分页键仍按屏幕像素前进。 */
export function useLogicalGalleryScroll(rootRef: RefObject<HTMLDivElement>, geometryRef: RefObject<GalleryGeometry>) {
  useEffect(() => {
    const root = rootRef.current
    if (!root) {
      return
    }
    let wheelTarget: { geometry: GalleryGeometry; height: number; logical: number; physical: number } | undefined
    const resetWheel = () => { wheelTarget = undefined }
    const wheel = (event: WheelEvent) => {
      const geometry = geometryRef.current
      if (!geometry || geometry.totalHeight <= galleryScrollHeight(geometry.totalHeight) || event.ctrlKey || !event.deltaY) {
        return
      }
      event.preventDefault()
      const height = root.clientHeight
      const previous = wheelTarget && wheelTarget.geometry === geometry && wheelTarget.height === height &&
        Math.abs(wheelTarget.physical - root.scrollTop) < 1
        ? wheelTarget.logical
        : galleryLogicalScrollTop(root.scrollTop, geometry.totalHeight, height)
      const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? height : 1)
      const logical = Math.max(0, Math.min(geometry.totalHeight - height, previous + delta))
      root.scrollTop = galleryPhysicalScrollTop(logical, geometry.totalHeight, height)
      // 保存尚未反映到 scrollTop 的小数步长，不丢失触控板的小 delta。
      wheelTarget = { geometry, height, logical, physical: root.scrollTop }
    }
    const key = (event: KeyboardEvent) => {
      resetWheel()
      const geometry = geometryRef.current
      if (!geometry || geometry.totalHeight <= galleryScrollHeight(geometry.totalHeight) || event.ctrlKey || event.metaKey || event.altKey ||
        (event.target as HTMLElement).closest('input,textarea,select,[contenteditable="true"]')) {
        return
      }
      const height = root.clientHeight
      const current = galleryLogicalScrollTop(root.scrollTop, geometry.totalHeight, height)
      let target: number
      switch (event.key) {
        case 'Home': target = 0; break
        case 'End': target = geometry.totalHeight - height; break
        case 'PageUp': target = current - height; break
        case 'PageDown': target = current + height; break
        case 'ArrowUp': target = current - 40; break
        case 'ArrowDown': target = current + 40; break
        case ' ':
          if (event.target !== root) { return }
          target = current + (event.shiftKey ? -height : height)
          break
        default: return
      }
      event.preventDefault()
      root.scrollTop = galleryPhysicalScrollTop(target, geometry.totalHeight, height)
    }
    root.addEventListener('wheel', wheel, { passive: false })
    root.addEventListener('keydown', key)
    root.addEventListener('mousedown', resetWheel, true)
    return () => {
      root.removeEventListener('wheel', wheel)
      root.removeEventListener('keydown', key)
      root.removeEventListener('mousedown', resetWheel, true)
    }
  }, [rootRef, geometryRef])
}
