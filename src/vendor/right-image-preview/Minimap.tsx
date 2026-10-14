import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { DelayedTooltip } from './DelayedTooltip';
import type { ZoomMode } from './types';
import {
  clampNatural,
  containerToNatural,
  minimapInnerToNatural,
  naturalToMinimapInner,
  panDeltaFromMinimapPointerDelta,
  pointInPolygon,
  rotatedRectExtents,
  type MinimapTransformParams,
} from './minimapMath';

const INNER = 152; // inner thumbnail box (px)
const BORDER = 2;
/** Flush to preview corner; bottom ~toolbar baseline (toolbar uses bottom: 20). */
const MINIMAP_RIGHT = 10;
const MINIMAP_BOTTOM = 22;

const DIM_OVERLAY_FILL = 'rgba(0,0,0,0.52)';

/** When the viewport quad is axis-aligned, dim with 4 `<rect>`s (no mask / evenodd). Some WebViews mis-composite those over `<img>`. */
function axisAlignedViewportInset(
  poly: [number, number][],
  tol = 0.75,
): { minX: number; maxX: number; minY: number; maxY: number } | null {
  if (poly.length !== 4) return null;
  const xs = poly.map((p) => p[0]);
  const ys = poly.map((p) => p[1]);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const near = (a: number, b: number) => Math.abs(a - b) <= tol;
  const onRectCorner = (x: number, y: number) =>
    (near(x, minX) || near(x, maxX)) && (near(y, minY) || near(y, maxY));
  if (!poly.every(([x, y]) => onRectCorner(x, y))) return null;
  if (maxX - minX < 0.5 || maxY - minY < 0.5) return null;
  return { minX, maxX, minY, maxY };
}

type PointerCapableElement = globalThis.Element & {
  setPointerCapture?: (pointerId: number) => void;
  hasPointerCapture?: (pointerId: number) => boolean;
  releasePointerCapture: (pointerId: number) => void;
};

function tryBeginPointerCapture(target: EventTarget | null, pointerId: number): { el: globalThis.Element; id: number } | null {
  if (!target) return null;
  const el = target as PointerCapableElement;
  if (typeof el.setPointerCapture !== 'function') return null;
  try {
    el.setPointerCapture(pointerId);
    return { el: target as globalThis.Element, id: pointerId };
  } catch {
    return null;
  }
}

function releasePointerCaptureIfActive(el: globalThis.Element, pointerId: number): void {
  const t = el as PointerCapableElement;
  try {
    if (typeof t.hasPointerCapture === 'function' && t.hasPointerCapture(pointerId)) {
      t.releasePointerCapture(pointerId);
    }
  } catch {
    /* ignore */
  }
}

export interface MinimapProps {
  /**
   * URL for the default minimap `<img>`. Parent should pass `minimapSrc ?? main src`.
   * Unused when {@link thumbnail} is set.
   */
  imageSrc: string;
  /** Custom minimap content; replaces the default `<img>`. */
  thumbnail?: ReactNode;
  imageAlt: string;
  nw: number;
  nh: number;
  cw: number;
  ch: number;
  /** Current CSS scale (same as main `transform.scale`). */
  scale: number;
  mode: ZoomMode;
  tx: number;
  ty: number;
  rotationDeg: number;
  flipH: boolean;
  flipV: boolean;
  controlsVisible: boolean;
  onPanByDelta: (dx: number, dy: number) => void;
  /**
   * Click-drag on the minimap outside the viewport frame: centre `(nx,ny)` then continue as a drag session.
   * Return clamped `{ tx, ty }` applied, or `undefined` if nothing changed.
   */
  onJumpToNatural?: (nx: number, ny: number) => { tx: number; ty: number } | undefined;
  onUserActivity?: () => void;
  /** Fires when the user starts / ends dragging the viewport frame (for disabling main-image transition). */
  onDragChange?: (dragging: boolean) => void;
  ariaLabel: string;
  /** Hover help for the minimap control (delayed tooltip). */
  minimapTooltip: string;
}

/**
 * Renders the overflow minimap and handles viewport-frame dragging.
 *
 * **Pointer session:** After `preventDefault()` on `pointerdown`, Chromium may not emit `mouseup`. The drag
 * must end via `pointerup` / `pointercancel` on `window` (capture). See `docs/minimap.md`.
 *
 * **Pan mapping:** Uses `panDeltaFromMinimapPointerDelta` (Jacobian at viewport centre), not quad AABB ratios.
 */
export function Minimap({
  imageSrc,
  thumbnail,
  imageAlt,
  nw,
  nh,
  cw,
  ch,
  scale,
  mode,
  tx,
  ty,
  rotationDeg,
  flipH,
  flipV,
  controlsVisible,
  onPanByDelta,
  onJumpToNatural,
  onUserActivity,
  onDragChange,
  ariaLabel,
  minimapTooltip,
}: MinimapProps) {
  const mainP: MinimapTransformParams = useMemo(
    () => ({ cw, ch, nw, nh, scale, tx, ty, rotationDeg, flipH, flipV }),
    [cw, ch, nw, nh, scale, tx, ty, rotationDeg, flipH, flipV],
  );

  const { rw, rh } = useMemo(() => rotatedRectExtents(nw, nh, rotationDeg), [nw, nh, rotationDeg]);
  const thumbS = useMemo(() => Math.min(INNER / Math.max(rw, 1e-6), INNER / Math.max(rh, 1e-6)) * 0.98, [rw, rh]);

  const cornersNat = useMemo(() => {
    const c: { nx: number; ny: number }[] = [
      containerToNatural(0, 0, mainP),
      containerToNatural(cw, 0, mainP),
      containerToNatural(cw, ch, mainP),
      containerToNatural(0, ch, mainP),
    ].map((p) => clampNatural(p.nx, p.ny, nw, nh));
    return c;
  }, [mainP, cw, ch, nw, nh]);

  const viewportMinimapPoly = useMemo((): [number, number][] => {
    return cornersNat.map((p) => {
      const { mx, my } = naturalToMinimapInner(
        p.nx, p.ny, INNER, INNER, nw, nh, thumbS, rotationDeg, flipH, flipV,
      );
      return [mx, my];
    });
  }, [cornersNat, nw, nh, thumbS, rotationDeg, flipH, flipV]);

  const polyPts = useMemo(() => {
    return viewportMinimapPoly.map(([mx, my]) => `${mx.toFixed(2)},${my.toFixed(2)}`).join(' ');
  }, [viewportMinimapPoly]);

  /** Axis-aligned inset → 4 rects; else evenodd path (rotated viewport on desktop). */
  const dimAxisInset = useMemo(
    () => axisAlignedViewportInset(viewportMinimapPoly),
    [viewportMinimapPoly],
  );

  const dimOverlayPathD = useMemo(() => {
    const outer = `M 0 0 L ${INNER} 0 L ${INNER} ${INNER} L 0 ${INNER} Z`;
    if (viewportMinimapPoly.length < 3) return outer;
    const hole = `${viewportMinimapPoly
      .map(([mx, my]) => `${mx.toFixed(2)} ${my.toFixed(2)}`)
      .reduce((cmd, pair, i) => (i === 0 ? `M ${pair}` : `${cmd} L ${pair}`), '')} Z`;
    return `${outer} ${hole}`;
  }, [viewportMinimapPoly]);

  /** Fresh `tx`/`ty` for each `pointermove` (updated in layout after `panByDelta`). */
  const dragTransformRef = useRef({ p: mainP, nw, nh, thumbS });
  useLayoutEffect(() => {
    dragTransformRef.current = { p: mainP, nw, nh, thumbS };
  }, [mainP, nw, nh, thumbS]);

  const [viewportDragging, setViewportDragging] = useState(false);
  const lastClientRef = useRef({ x: 0, y: 0 });

  const docSessionRef = useRef<{
    move: (e: PointerEvent) => void;
    up: (e: PointerEvent) => void;
    blur: () => void;
  } | null>(null);
  const pointerCaptureRef = useRef<{ el: globalThis.Element; id: number } | null>(null);

  const onPanByDeltaRef = useRef(onPanByDelta);
  const onJumpToNaturalRef = useRef(onJumpToNatural);
  const onUserActivityRef = useRef(onUserActivity);
  const onDragChangeRef = useRef(onDragChange);
  useLayoutEffect(() => {
    onPanByDeltaRef.current = onPanByDelta;
    onJumpToNaturalRef.current = onJumpToNatural;
    onUserActivityRef.current = onUserActivity;
    onDragChangeRef.current = onDragChange;
  }, [onPanByDelta, onJumpToNatural, onUserActivity, onDragChange]);

  const teardownMinimapDrag = () => {
    const s = docSessionRef.current;
    if (!s) return;
    window.removeEventListener('blur', s.blur);
    window.removeEventListener('pointermove', s.move, true);
    window.removeEventListener('pointerup', s.up, true);
    window.removeEventListener('pointercancel', s.up, true);
    docSessionRef.current = null;

    const cap = pointerCaptureRef.current;
    if (cap) {
      pointerCaptureRef.current = null;
      releasePointerCaptureIfActive(cap.el, cap.id);
    }
  };

  const endMinimapDrag = () => {
    if (!docSessionRef.current) return;
    teardownMinimapDrag();
    setViewportDragging(false);
    onDragChangeRef.current?.(false);
    onUserActivityRef.current?.();
  };

  useEffect(
    () => () => {
      if (docSessionRef.current) {
        teardownMinimapDrag();
        onDragChangeRef.current?.(false);
      }
    },
    [],
  );

  /** Shared window-level drag: Jacobian maps minimap client deltas → container `panByDelta`. */
  const attachMinimapDragSession = (
    e: React.PointerEvent,
    captureEl: Element | null,
    pForJacobian: MinimapTransformParams,
  ) => {
    if (docSessionRef.current) endMinimapDrag();

    e.preventDefault();
    e.stopPropagation();

    dragTransformRef.current = { p: pForJacobian, nw, nh, thumbS };

    const pointerId = e.pointerId;
    lastClientRef.current = { x: e.clientX, y: e.clientY };
    setViewportDragging(true);
    onDragChangeRef.current?.(true);
    onUserActivityRef.current?.();

    const applyClientDelta = (clientX: number, clientY: number) => {
      const dx = clientX - lastClientRef.current.x;
      const dy = clientY - lastClientRef.current.y;
      lastClientRef.current = { x: clientX, y: clientY };
      if (dx === 0 && dy === 0) return;

      const { p, nw: nw0, nh: nh0, thumbS: ts } = dragTransformRef.current;
      const { dtx, dty } = panDeltaFromMinimapPointerDelta(dx, dy, p, nw0, nh0, INNER, ts);
      const pan = onPanByDeltaRef.current;
      if (typeof pan === 'function' && Number.isFinite(dtx) && Number.isFinite(dty)) {
        pan(dtx, dty);
      }
      onUserActivityRef.current?.();
    };

    const onBlurWindow = () => endMinimapDrag();

    pointerCaptureRef.current = captureEl ? tryBeginPointerCapture(captureEl, pointerId) : null;

    const onMove = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId) return;
      ev.preventDefault();
      applyClientDelta(ev.clientX, ev.clientY);
    };
    const onUp = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId) return;
      ev.preventDefault();
      endMinimapDrag();
    };

    docSessionRef.current = { move: onMove, up: onUp, blur: onBlurWindow };
    window.addEventListener('pointermove', onMove, { capture: true, passive: false });
    window.addEventListener('pointerup', onUp, { capture: true });
    window.addEventListener('pointercancel', onUp, { capture: true });
    window.addEventListener('blur', onBlurWindow);
  };

  const onViewportHandleDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    attachMinimapDragSession(e, e.currentTarget, mainP);
  };

  const onBackgroundPointerDown = (e: React.PointerEvent<SVGRectElement>) => {
    if (e.button !== 0) return;
    const jump = onJumpToNaturalRef.current;
    if (typeof jump !== 'function') return;
    if (docSessionRef.current) return;

    const svg = e.currentTarget.ownerSVGElement;
    if (!svg) return;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const ctm = svg.getScreenCTM();
    if (!ctm) return;
    let loc: DOMPoint;
    try {
      loc = pt.matrixTransform(ctm.inverse());
    } catch {
      return;
    }
    const mx = loc.x;
    const my = loc.y;
    if (pointInPolygon(mx, my, viewportMinimapPoly)) return;

    const { nx, ny } = minimapInnerToNatural(
      mx, my, INNER, nw, nh, thumbS, rotationDeg, flipH, flipV,
    );
    const applied = jump(nx, ny);
    if (!applied) return;

    const pAfter: MinimapTransformParams = { ...mainP, tx: applied.tx, ty: applied.ty };
    attachMinimapDragSession(e, e.currentTarget, pAfter);
  };

  const normDeg = ((rotationDeg % 360) + 360) % 360;
  const swapped = normDeg === 90 || normDeg === 270;
  const sw = (swapped ? nh : nw) * scale;
  const sh = (swapped ? nw : nh) * scale;
  const overflow = mode === 'native' && (sw > cw + 0.5 || sh > ch + 0.5);

  if (!overflow || nw <= 0 || nh <= 0 || cw <= 0 || ch <= 0) return null;

  /**
   * Bake `thumbS` into width/height instead of `transform: scale(thumbS)` on full natural pixels.
   * VS Code / embedded Chromium often composites a **multi‑megapixel layer** + tiny scale as solid black;
   * removing inline styles “fixes” it because the box drops to intrinsic size.
   */
  const thumbW = nw * thumbS;
  const thumbH = nh * thumbS;
  const thumbTransform = `rotate(${rotationDeg}deg)${flipH ? ' scaleX(-1)' : ''}${flipV ? ' scaleY(-1)' : ''}`;

  return (
    <DelayedTooltip content={minimapTooltip}>
    <div
      role="navigation"
      aria-label={ariaLabel}
      onWheel={(e) => {
        e.stopPropagation();
        onUserActivity?.();
      }}
      style={{
        position: 'absolute',
        right: MINIMAP_RIGHT,
        bottom: MINIMAP_BOTTOM,
        zIndex: 25,
        padding: BORDER,
        background: 'rgba(8,12,22,0.88)',
        border: '2px solid rgba(255,255,255,0.92)',
        borderRadius: 4,
        boxShadow: '0 4px 18px rgba(0,0,0,0.55)',
        opacity: controlsVisible ? 1 : 0.12,
        transition: controlsVisible ? 'opacity 0.12s ease' : 'opacity 1.6s ease',
        userSelect: 'none',
        touchAction: 'none',
        cursor: viewportDragging ? 'grabbing' : onJumpToNatural ? 'default' : undefined,
      }}
    >
      <div
        style={{
          width: INNER,
          height: INNER,
          position: 'relative',
          overflow: 'hidden',
          background: 'rgba(0,0,0,0.35)',
        }}
      >
        <div
          style={{
            position: 'absolute',
            left: (INNER - thumbW) / 2,
            top: (INNER - thumbH) / 2,
            width: thumbW,
            height: thumbH,
            transform: thumbTransform,
            transformOrigin: 'center center',
            pointerEvents: 'none',
            overflow: 'hidden',
          }}
        >
          {thumbnail != null ? (
            <div
              style={{
                width: '100%',
                height: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {thumbnail}
            </div>
          ) : (
            <img
              src={imageSrc}
              alt={imageAlt}
              draggable={false}
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'fill',
                display: 'block',
                pointerEvents: 'none',
              }}
            />
          )}
        </div>
        <svg
          width={INNER}
          height={INNER}
          style={{ position: 'absolute', left: 0, top: 0, display: 'block' }}
          aria-hidden="true"
        >
          {/* Hit target below dimmed overlay + viewport polygon: click outside the frame to recenter. */}
          {onJumpToNatural && (
            <rect
              width={INNER}
              height={INNER}
              fill="rgba(0,0,0,0.001)"
              style={{ cursor: 'pointer', touchAction: 'none' }}
              onPointerDown={onBackgroundPointerDown}
            />
          )}
          {dimAxisInset ? (
            <>
              <rect
                x={0}
                y={0}
                width={INNER}
                height={dimAxisInset.minY}
                fill={DIM_OVERLAY_FILL}
                style={{ pointerEvents: 'none' }}
              />
              <rect
                x={0}
                y={dimAxisInset.maxY}
                width={INNER}
                height={INNER - dimAxisInset.maxY}
                fill={DIM_OVERLAY_FILL}
                style={{ pointerEvents: 'none' }}
              />
              <rect
                x={0}
                y={dimAxisInset.minY}
                width={dimAxisInset.minX}
                height={dimAxisInset.maxY - dimAxisInset.minY}
                fill={DIM_OVERLAY_FILL}
                style={{ pointerEvents: 'none' }}
              />
              <rect
                x={dimAxisInset.maxX}
                y={dimAxisInset.minY}
                width={INNER - dimAxisInset.maxX}
                height={dimAxisInset.maxY - dimAxisInset.minY}
                fill={DIM_OVERLAY_FILL}
                style={{ pointerEvents: 'none' }}
              />
            </>
          ) : (
            <path
              d={dimOverlayPathD}
              fill={DIM_OVERLAY_FILL}
              fillRule="evenodd"
              style={{ pointerEvents: 'none' }}
            />
          )}
          {/* Viewport frame: thin solid light stroke (Lightroom-style), single interactive layer */}
          <polygon
            points={polyPts}
            fill="rgba(255,255,255,0.06)"
            stroke="rgba(255,255,255,0.9)"
            strokeWidth={1}
            strokeLinejoin="miter"
            vectorEffect="non-scaling-stroke"
            style={{ cursor: viewportDragging ? 'grabbing' : 'grab', pointerEvents: 'all' }}
            onPointerDown={onViewportHandleDown}
          />
        </svg>
      </div>
    </div>
    </DelayedTooltip>
  );
}
