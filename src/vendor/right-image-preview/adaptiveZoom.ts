import type { ZoomState } from './types'

export type AdaptiveZoomTarget = { mode: 'fit' } | { mode: 'native'; percent: number }

/** Detail 使用倍率的几何中点；只有两侧都至少相差 1.5 倍才有观察价值。 */
export function nextAdaptiveZoom(state: ZoomState): AdaptiveZoomTarget {
  const fit = state.fitEquivalentNativePercent
  if (Number.isFinite(fit) && Math.abs(fit - 100) < 0.01) {
    return state.mode === 'fit' || state.nativePercent === 100
      ? { mode: 'native', percent: 200 }
      : { mode: 'fit' }
  }
  const midpoint = fit > 0 && fit < 100 ? Math.max(1, Math.round(Math.sqrt(fit * 100) / 5) * 5) : 0
  const detail = midpoint > 0 && midpoint / fit >= 1.5 && 100 / midpoint >= 1.5 ? midpoint : undefined
  if (state.mode === 'fit') {
    return { mode: 'native', percent: detail ?? 100 }
  }
  return detail && state.nativePercent === detail ? { mode: 'native', percent: 100 } : { mode: 'fit' }
}

export function adaptiveZoomLabel(target: AdaptiveZoomTarget): string {
  return target.mode === 'fit' ? 'Fit' : `${target.percent}%`
}
