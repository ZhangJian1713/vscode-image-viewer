import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { ZoomMode } from './types';
import {
  MAIN_DRAG_MIN_VIEWPORT_COVERAGE,
  MINIMAP_PAN_MIN_VIEWPORT_COVERAGE,
  ZOOM_CLAMP_MIN_VIEWPORT_COVERAGE,
} from './imagePreviewTuning';
import { translateForViewportCentreOnNatural, type MinimapTransformParams } from './minimapMath';

export interface ImageDimensions {
  naturalWidth: number;
  naturalHeight: number;
}

export interface ContainerSize {
  width: number;
  height: number;
}

/** Accumulated rotation in degrees (not wrapped to 0-360, intentionally). */
export type Rotation = number;

export interface TransformState {
  scale: number;
  translateX: number;
  translateY: number;
  rotation: Rotation;
  flipH: boolean;
  flipV: boolean;
  /** Precomputed CSS transform string — apply directly to the img element. */
  cssTransform: string;
}

export interface UseImageTransformOptions {
  mode: ZoomMode;
  nativePercent: number;
  fitResetPan: boolean;
  fitMaxNativePercent?: number;
}

export interface UseImageTransformResult {
  transform: TransformState;
  /** True while the user is actively dragging (disable CSS transition during pan). */
  isPanning: boolean;
  /** Fit-equivalent native% (undefined until both image and container are measured). */
  fitEquivalentNativePercent: number | undefined;
  /** Callback ref – pass as `ref={setContainerEl}` on the viewport div. */
  setContainerEl: (el: HTMLDivElement | null) => void;
  onImageLoad(dims: ImageDimensions): void;
  resetImageDims(): void;
  onPanStart(e: React.PointerEvent): void;
  onPanMove(e: React.PointerEvent): void;
  onPanEnd(e?: React.PointerEvent): void;
  resetPan(): void;
  rotateCW(): void;
  rotateCCW(): void;
  flipHorizontal(): void;
  flipVertical(): void;
  /** Reset rotation and flip to their initial state. */
  resetOrientation(): void;
  imageDims: ImageDimensions | null;
  containerSize: ContainerSize | null;
  /**
   * Adjust translate so the image point currently at (anchorX, anchorY) in
   * viewport-centre coordinates stays there after the scale changes from
   * prevScale to newScale.  Call this BEFORE the zoom state update so both
   * land in the same React render batch and the built-in proportional-adjust
   * effect skips its own correction.
   */
  zoomAnchorTranslate(prevScale: number, newScale: number, anchorX: number, anchorY: number): void;
  /**
   * Pan by a delta in **container / screen** pixels (same space as {@link translateX} / {@link translateY}).
   * Only applies in `native` mode. Clamps **stricter** than main-image drag (`imagePreviewTuning.ts`).
   */
  panByDelta(dx: number, dy: number): void;
  /**
   * In `native` mode, pan so the given natural-image point is centred in the viewport
   * (used by minimap background click). Clamped like {@link panByDelta}.
   */
  /** Returns clamped `(tx, ty)` applied to the transform, or `undefined` if unchanged / not in native mode. */
  panJumpToNatural(nx: number, ny: number): { tx: number; ty: number } | undefined;
}

function computeFitScale(dims: ImageDimensions, container: ContainerSize): number {
  if (container.width === 0 || container.height === 0) return 1;
  return Math.min(container.width / dims.naturalWidth, container.height / dims.naturalHeight);
}

/**
 * Clamp (tx, ty) so overlap between viewport and image meets a minimum on each axis.
 *
 * Rule: overlap on each axis ≥ min(scaledDim/2, minViewportCoverage × viewportDim).
 * Coverage values come from `imagePreviewTuning.ts`.
 */
function clampTranslateForVisibility(
  tx: number,
  ty: number,
  scale: number,
  dims: ImageDimensions,
  container: ContainerSize,
  rotation: Rotation,
  minViewportCoverage: number,
): { x: number; y: number } {
  const normDeg = ((rotation % 360) + 360) % 360;
  const isSwapped = normDeg === 90 || normDeg === 270;
  const scaledW = (isSwapped ? dims.naturalHeight : dims.naturalWidth)  * scale;
  const scaledH = (isSwapped ? dims.naturalWidth  : dims.naturalHeight) * scale;
  const { width: vw, height: vh } = container;
  const ox = Math.min(scaledW / 2, minViewportCoverage * vw);
  const oy = Math.min(scaledH / 2, minViewportCoverage * vh);
  return {
    x: Math.max(-vw / 2 + ox - scaledW / 2, Math.min(vw / 2 - ox + scaledW / 2, tx)),
    y: Math.max(-vh / 2 + oy - scaledH / 2, Math.min(vh / 2 - oy + scaledH / 2, ty)),
  };
}

function buildCssTransform(
  tx: number,
  ty: number,
  rotation: Rotation,
  flipH: boolean,
  flipV: boolean,
  scale: number,
): string {
  const parts: string[] = [`translate(${tx}px, ${ty}px)`, `rotate(${rotation}deg)`];
  if (flipH) parts.push('scaleX(-1)');
  if (flipV) parts.push('scaleY(-1)');
  parts.push(`scale(${scale})`);
  return parts.join(' ');
}

export function useImageTransform(options: UseImageTransformOptions): UseImageTransformResult {
  const { mode, nativePercent, fitResetPan, fitMaxNativePercent = Infinity } = options;

  const [imageDims, setImageDims] = useState<ImageDimensions | null>(null);
  const [containerSize, setContainerSize] = useState<ContainerSize | null>(null);

  // Translate — kept in both state (drives render) and ref (sync read in event handlers).
  const [translateX, setTranslateX] = useState(0);
  const [translateY, setTranslateY] = useState(0);
  const translateRef = useRef({ x: 0, y: 0 });

  const [rotation, setRotation] = useState<Rotation>(0);
  const [flipH, setFlipH] = useState(false);
  const [flipV, setFlipV] = useState(false);
  const [isPanning, setIsPanning] = useState(false);

  const [containerEl, setContainerEl] = useState<HTMLDivElement | null>(null);

  const panStartRef = useRef<{ x: number; y: number; tx: number; ty: number } | null>(null);
  const pointersRef = useRef<Map<number, PointerEvent>>(new Map());

  const applyTranslate = useCallback((x: number, y: number) => {
    translateRef.current = { x, y };
    setTranslateX(x);
    setTranslateY(y);
  }, []);

  // ── Container measurement ─────────────────────────────────────────────────

  useEffect(() => {
    if (!containerEl) return;
    const ro = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (rect) setContainerSize({ width: rect.width, height: rect.height });
    });
    ro.observe(containerEl);
    return () => ro.disconnect();
  }, [containerEl]);

  // ── Image dims ────────────────────────────────────────────────────────────

  const onImageLoad = useCallback((dims: ImageDimensions) => {
    setImageDims((prev) => {
      if (
        prev &&
        prev.naturalWidth === dims.naturalWidth &&
        prev.naturalHeight === dims.naturalHeight
      ) {
        return prev;
      }
      return dims;
    });
  }, []);

  const resetImageDims = useCallback(() => setImageDims(null), []);

  // ── Pan reset on fit ──────────────────────────────────────────────────────

  const prevModeRef = useRef(mode);
  useEffect(() => {
    if (prevModeRef.current !== 'fit' && mode === 'fit' && fitResetPan) {
      // Pan state is translate state; resetting when entering Fit must follow mode transition.
      applyTranslate(0, 0);
    }
    prevModeRef.current = mode;
  }, [mode, fitResetPan, applyTranslate]);

  const resetPan = useCallback(() => applyTranslate(0, 0), [applyTranslate]);

  const panByDelta = useCallback(
    (dx: number, dy: number) => {
      if (mode !== 'native' || !imageDims || !containerSize) return;
      const s = nativePercent / 100;
      const nx = translateRef.current.x + dx;
      const ny = translateRef.current.y + dy;
      const c = clampTranslateForVisibility(
        nx,
        ny,
        s,
        imageDims,
        containerSize,
        rotation,
        MINIMAP_PAN_MIN_VIEWPORT_COVERAGE,
      );
      applyTranslate(c.x, c.y);
    },
    [mode, imageDims, containerSize, rotation, nativePercent, applyTranslate],
  );

  const panJumpToNatural = useCallback(
    (nx: number, ny: number): { tx: number; ty: number } | undefined => {
      if (mode !== 'native' || !imageDims || !containerSize) return undefined;
      const s = nativePercent / 100;
      const p: MinimapTransformParams = {
        cw: containerSize.width,
        ch: containerSize.height,
        nw: imageDims.naturalWidth,
        nh: imageDims.naturalHeight,
        scale: s,
        tx: translateRef.current.x,
        ty: translateRef.current.y,
        rotationDeg: rotation,
        flipH,
        flipV,
      };
      const { tx, ty } = translateForViewportCentreOnNatural(nx, ny, p);
      const c = clampTranslateForVisibility(
        tx,
        ty,
        s,
        imageDims,
        containerSize,
        rotation,
        MINIMAP_PAN_MIN_VIEWPORT_COVERAGE,
      );
      applyTranslate(c.x, c.y);
      return { tx: c.x, ty: c.y };
    },
    [mode, imageDims, containerSize, rotation, nativePercent, flipH, flipV, applyTranslate],
  );

  // ── Rotation & flip ───────────────────────────────────────────────────────

  // Do NOT wrap with % 360. Keeping an ever-increasing (or decreasing) value
  // ensures the CSS transition always interpolates in the correct direction.
  // Wrapping 270 → 0 would make the browser animate -270° (backwards).
  const rotateCW = useCallback(() => setRotation((r) => r + 90), []);
  const rotateCCW = useCallback(() => setRotation((r) => r - 90), []);
  const flipHorizontal = useCallback(() => setFlipH((v) => !v), []);
  const flipVertical = useCallback(() => setFlipV((v) => !v), []);
  const resetOrientation = useCallback(() => {
    setRotation(0);
    setFlipH(false);
    setFlipV(false);
  }, []);

  // ── Pointer-drag pan ──────────────────────────────────────────────────────

  const onPanStart = useCallback((e: React.PointerEvent) => {
    if (e.button !== 0) return;
    pointersRef.current.set(e.pointerId, e.nativeEvent);
    if (pointersRef.current.size === 1) {
      panStartRef.current = {
        x: e.clientX,
        y: e.clientY,
        tx: translateRef.current.x,
        ty: translateRef.current.y,
      };
      setIsPanning(true);
    }
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, []);

  const onPanMove = useCallback((e: React.PointerEvent) => {
    if (e.buttons === 0) {
      pointersRef.current.clear();
      panStartRef.current = null;
      setIsPanning(false);
      return;
    }
    pointersRef.current.set(e.pointerId, e.nativeEvent);
    if (pointersRef.current.size === 1 && panStartRef.current) {
      const dx = e.clientX - panStartRef.current.x;
      const dy = e.clientY - panStartRef.current.y;
      let nx = panStartRef.current.tx + dx;
      let ny = panStartRef.current.ty + dy;
      if (mode === 'native' && imageDims && containerSize) {
        const s = nativePercent / 100;
        const c = clampTranslateForVisibility(
          nx,
          ny,
          s,
          imageDims,
          containerSize,
          rotation,
          MAIN_DRAG_MIN_VIEWPORT_COVERAGE,
        );
        nx = c.x;
        ny = c.y;
      }
      applyTranslate(nx, ny);
    }
  }, [applyTranslate, mode, imageDims, containerSize, rotation, nativePercent]);

  const onPanEnd = useCallback((e?: React.PointerEvent) => {
    if (e) pointersRef.current.delete(e.pointerId);
    if (pointersRef.current.size === 0) {
      panStartRef.current = null;
      setIsPanning(false);
    }
  }, []);

  // ── Proportional translate adjustment on zoom ─────────────────────────────
  // When zoom level changes via toolbar / keyboard (not via cursor-anchor),
  // scale translate by (s2/s1) so the image centre stays in the same relative
  // position.  Cursor-based wheel zoom sets skipZoomTranslateRef to opt out.

  const prevNativePercentRef = useRef(nativePercent);
  const skipZoomTranslateRef = useRef(false);

  // Reset "previous" tracking whenever we return to fit mode (e.g. image switch).
  useEffect(() => {
    if (mode === 'fit') prevNativePercentRef.current = 0; // sentinel → skip next
  }, [mode]);

  useLayoutEffect(() => {
    const prev = prevNativePercentRef.current;
    prevNativePercentRef.current = nativePercent; // always keep in sync

    if (skipZoomTranslateRef.current) {
      skipZoomTranslateRef.current = false;
      return; // cursor-anchor already set the translate
    }

    if (mode !== 'native' || !imageDims) return;
    if (prev === 0 || prev === nativePercent) return; // first entry or no change

    // Scale translate proportionally so the viewport-centre image point is preserved.
    const ratio = nativePercent / prev;
    let newTx = translateRef.current.x * ratio;
    let newTy = translateRef.current.y * ratio;

    // Safety clamp: keep image meaningfully visible after any zoom.
    if (containerSize) {
      const c = clampTranslateForVisibility(
        newTx,
        newTy,
        nativePercent / 100,
        imageDims,
        containerSize,
        rotation,
        ZOOM_CLAMP_MIN_VIEWPORT_COVERAGE,
      );
      newTx = c.x;
      newTy = c.y;
    }

    applyTranslate(newTx, newTy);
  }, [nativePercent, mode, imageDims, containerSize, rotation, applyTranslate]);

  // Exposed helper: set translate so the image point at (anchorX, anchorY)
  // stays fixed after the scale changes from prevScale to newScale,
  // then clamps the result so the image remains meaningfully visible.
  const zoomAnchorTranslate = useCallback(
    (prevScale: number, newScale: number, anchorX: number, anchorY: number) => {
      if (prevScale === 0 || prevScale === newScale) return;
      skipZoomTranslateRef.current = true; // tell the useLayoutEffect to skip
      const ratio = newScale / prevScale;
      // In fit mode the visual translate is always (0, 0) — effectiveTx/Ty is
      // forced to 0 in the render, regardless of what translateRef holds (it
      // may retain a stale value from a previous native-mode pan session).
      // Using the stale value would mis-place the anchor and send the image
      // flying off-screen, so we always read the *effective* position here.
      const curTx = mode === 'fit' ? 0 : translateRef.current.x;
      const curTy = mode === 'fit' ? 0 : translateRef.current.y;
      let newTx = anchorX * (1 - ratio) + curTx * ratio;
      let newTy = anchorY * (1 - ratio) + curTy * ratio;

      // Safety clamp so the image never flies off-screen, even when the
      // cursor is far from the image (e.g. opposite corner of the viewport).
      if (imageDims && containerSize) {
        const c = clampTranslateForVisibility(
          newTx,
          newTy,
          newScale,
          imageDims,
          containerSize,
          rotation,
          ZOOM_CLAMP_MIN_VIEWPORT_COVERAGE,
        );
        newTx = c.x;
        newTy = c.y;
      }

      applyTranslate(newTx, newTy);
    },
    [applyTranslate, imageDims, containerSize, rotation, mode],
  );

  // ── Derive scale & transform ──────────────────────────────────────────────

  let scale = 1;
  let fitEquivalentNativePercent: number | undefined;

  if (imageDims && containerSize) {
    // Normalise to 0-359 for the swap check (rotation may be negative or > 360).
    const normDeg = ((rotation % 360) + 360) % 360;
    const isSwapped = normDeg === 90 || normDeg === 270;
    const fitDims = isSwapped
      ? { naturalWidth: imageDims.naturalHeight, naturalHeight: imageDims.naturalWidth }
      : imageDims;
    const fitScale = Math.min(fitMaxNativePercent / 100, computeFitScale(fitDims, containerSize));
    fitEquivalentNativePercent = fitScale * 100;
    scale = mode === 'fit' ? fitScale : nativePercent / 100;
  }

  const effectiveTx = mode === 'fit' ? 0 : translateX;
  const effectiveTy = mode === 'fit' ? 0 : translateY;
  const cssTransform = buildCssTransform(effectiveTx, effectiveTy, rotation, flipH, flipV, scale);

  return {
    transform: { scale, translateX: effectiveTx, translateY: effectiveTy, rotation, flipH, flipV, cssTransform },
    isPanning,
    fitEquivalentNativePercent,
    setContainerEl,
    onImageLoad,
    resetImageDims,
    onPanStart,
    onPanMove,
    onPanEnd,
    resetPan,
    rotateCW,
    rotateCCW,
    flipHorizontal,
    flipVertical,
    resetOrientation,
    imageDims,
    containerSize,
    zoomAnchorTranslate,
    panByDelta,
    panJumpToNatural,
  };
}
