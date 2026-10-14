import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { MIN_PROGRESSIVE_THUMB_VISIBLE_MS, PROGRESSIVE_PRELOAD_TIMEOUT_MS } from './imagePreviewTuning';
import type { MainImageLoadStage } from './types';
import type { ImageDimensions } from './useImageTransform';

export interface UseProgressiveMainImageArgs {
  mainSrc: string;
  minimapSrc: string | undefined;
  /** When true, the item uses a custom minimap node — progressive main is disabled. */
  minimapCustom: boolean;
  enabled: boolean;
  onImageLayout: (d: ImageDimensions) => void;
  onStageChange?: (stage: MainImageLoadStage) => void;
}

export interface UseProgressiveMainImageResult {
  pipelineActive: boolean;
  preloadStage: MainImageLoadStage;
  fullDecoded: boolean;
  /**
   * True when the minimap URL should paint in the main area (parallel preload or placeholder).
   * Keeps the thumbnail visible during long main-image decode instead of a black box.
   */
  showMinimapUnderlay: boolean;
  /** Call from the visible &lt;img&gt; `onLoad` after optional `decode()`. */
  onMainImgDecoded: () => void;
}

function useLatestRef<T>(value: T) {
  const r = useRef(value);
  useLayoutEffect(() => {
    r.current = value;
  });
  return r;
}

/**
 * Preloads the full image to obtain natural dimensions (for layout / minimap),
 * then keeps a thumbnail underlay until the real &lt;img&gt; has loaded+decoded.
 */
export function useProgressiveMainImage({
  mainSrc,
  minimapSrc,
  minimapCustom,
  enabled,
  onImageLayout,
  onStageChange,
}: UseProgressiveMainImageArgs): UseProgressiveMainImageResult {
  const onStageChangeRef = useLatestRef(onStageChange);
  const onImageLayoutRef = useLatestRef(onImageLayout);

  const pipelineActive =
    enabled && !!minimapSrc && minimapSrc !== mainSrc && !minimapCustom;

  const [preloadStage, setPreloadStage] = useState<MainImageLoadStage>('inactive');
  const [fullDecoded, setFullDecoded] = useState(false);
  /** Minimap `Image()` finished while main is still preloading — layout + underlay can show immediately. */
  const [minimapPrelayoutReady, setMinimapPrelayoutReady] = useState(false);
  const genRef = useRef(0);
  const preloadStageRef = useRef<MainImageLoadStage>(preloadStage);
  useLayoutEffect(() => {
    preloadStageRef.current = preloadStage;
  }, [preloadStage]);

  /** Main &lt;img&gt; is ready before preload promoted to `thumbnail-placeholder` (typical with HTTP cache). */
  const pendingMainRevealRef = useRef(false);
  const thumbPlaceholderEnteredAtRef = useRef<number | null>(null);
  const revealTimeoutRef = useRef<number | null>(null);
  /** After we reveal the main layer, ignore duplicate `onMainImgDecoded` (decode + timeout). */
  const revealCompletedRef = useRef(false);

  const clearRevealTimeout = useCallback(() => {
    if (revealTimeoutRef.current !== null) {
      window.clearTimeout(revealTimeoutRef.current);
      revealTimeoutRef.current = null;
    }
  }, []);

  const armRevealAfterDwell = useCallback(() => {
    if (revealCompletedRef.current) return;
    clearRevealTimeout();
    const t0 = thumbPlaceholderEnteredAtRef.current;
    const dwell = MIN_PROGRESSIVE_THUMB_VISIBLE_MS;
    const elapsed = t0 == null ? 0 : performance.now() - t0;
    const wait = Math.max(0, dwell - elapsed);
    revealTimeoutRef.current = window.setTimeout(() => {
      revealTimeoutRef.current = null;
      revealCompletedRef.current = true;
      setFullDecoded(true);
      onStageChangeRef.current?.('full-ready');
    }, wait);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- onStageChangeRef
  }, [clearRevealTimeout]);

  useEffect(() => {
    setFullDecoded(false);
    setMinimapPrelayoutReady(false);
    pendingMainRevealRef.current = false;
    thumbPlaceholderEnteredAtRef.current = null;
    revealCompletedRef.current = false;
    clearRevealTimeout();
  }, [mainSrc, pipelineActive, clearRevealTimeout]);

  useEffect(() => {
    if (!pipelineActive) {
      setPreloadStage('inactive');
      return undefined;
    }
    setPreloadStage('preloading');
    onStageChangeRef.current?.('preloading');

    const gen = ++genRef.current;
    let cancelled = false;
    /** Main `Image()` probe finished (success or error) — do not apply late minimap dimensions after that. */
    let mainProbeFinished = false;

    // Parallel minimap preload: small file → layout + underlay immediately while main may take seconds.
    if (minimapSrc && minimapSrc !== mainSrc) {
      const tEarly = new Image();
      tEarly.onload = () => {
        if (cancelled || gen !== genRef.current || mainProbeFinished) return;
        onImageLayoutRef.current({
          naturalWidth: tEarly.naturalWidth,
          naturalHeight: tEarly.naturalHeight,
        });
        setMinimapPrelayoutReady(true);
      };
      tEarly.onerror = () => {
        /* main or tryMinimapFallback will still attempt layout */
      };
      tEarly.src = minimapSrc;
    }

    const img = new Image();
    /** Timeout id assigned after `img.src` (sync cache `onload` must not read before assign). */
    const preloadTimeoutHolder: { id?: number } = {};
    /** After we fall back to minimap (or give up on main), ignore a very late main `onload`. */
    let ignoreMainPreloadResult = false;
    let minimapFallbackStarted = false;

    const tryMinimapFallback = () => {
      if (cancelled || gen !== genRef.current || minimapFallbackStarted) return;
      minimapFallbackStarted = true;
      ignoreMainPreloadResult = true;
      mainProbeFinished = true;
      if (!minimapSrc || minimapSrc === mainSrc) {
        setPreloadStage('error');
        onStageChangeRef.current?.('error');
        return;
      }
      const thumb = new Image();
      thumb.onload = () => {
        if (cancelled || gen !== genRef.current) return;
        onImageLayoutRef.current({
          naturalWidth: thumb.naturalWidth,
          naturalHeight: thumb.naturalHeight,
        });
        setFullDecoded(true);
        setPreloadStage('thumb-only');
        onStageChangeRef.current?.('thumb-only');
      };
      thumb.onerror = () => {
        if (cancelled || gen !== genRef.current) return;
        setPreloadStage('error');
        onStageChangeRef.current?.('error');
      };
      thumb.src = minimapSrc;
    };

    img.onload = () => {
      if (cancelled || gen !== genRef.current || ignoreMainPreloadResult) return;
      if (preloadTimeoutHolder.id !== undefined) window.clearTimeout(preloadTimeoutHolder.id);
      mainProbeFinished = true;
      onImageLayoutRef.current({
        naturalWidth: img.naturalWidth,
        naturalHeight: img.naturalHeight,
      });
      thumbPlaceholderEnteredAtRef.current = performance.now();
      setPreloadStage('thumbnail-placeholder');
      onStageChangeRef.current?.('thumbnail-placeholder');
      if (pendingMainRevealRef.current) {
        pendingMainRevealRef.current = false;
        armRevealAfterDwell();
      }
    };
    img.onerror = () => {
      if (cancelled || gen !== genRef.current) return;
      mainProbeFinished = true;
      if (preloadTimeoutHolder.id !== undefined) window.clearTimeout(preloadTimeoutHolder.id);
      tryMinimapFallback();
    };
    img.src = mainSrc;

    preloadTimeoutHolder.id = window.setTimeout(() => {
      if (cancelled || gen !== genRef.current) return;
      tryMinimapFallback();
    }, PROGRESSIVE_PRELOAD_TIMEOUT_MS);

    return () => {
      cancelled = true;
      if (preloadTimeoutHolder.id !== undefined) window.clearTimeout(preloadTimeoutHolder.id);
    };
  },
  // eslint-disable-next-line react-hooks/exhaustive-deps -- onImageLayoutRef, onStageChangeRef
  [mainSrc, minimapSrc, pipelineActive, armRevealAfterDwell],
  );

  const onMainImgDecoded = useCallback(() => {
    const active = enabled && !!minimapSrc && minimapSrc !== mainSrc && !minimapCustom;
    if (!active) {
      setFullDecoded(true);
      return;
    }
    if (revealCompletedRef.current) return;

    const stage = preloadStageRef.current;
    if (stage === 'preloading') {
      pendingMainRevealRef.current = true;
      return;
    }
    if (stage === 'thumbnail-placeholder') {
      armRevealAfterDwell();
      return;
    }

    setFullDecoded(true);
    if (stage === 'error') {
      onStageChangeRef.current?.('full-ready');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- preloadStageRef, onStageChangeRef
  }, [enabled, minimapSrc, minimapCustom, mainSrc, armRevealAfterDwell]);

  const showMinimapUnderlay =
    pipelineActive &&
    !!minimapSrc &&
    (minimapPrelayoutReady ||
      preloadStage === 'thumbnail-placeholder' ||
      preloadStage === 'thumb-only');

  return { pipelineActive, preloadStage, fullDecoded, showMinimapUnderlay, onMainImgDecoded };
}
