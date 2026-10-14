import * as React from 'react';
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { DelayedTooltip } from './DelayedTooltip';
import { Minimap } from './Minimap';
import { Toolbar } from './Toolbar';
import { runFlushSync } from './flushSyncCompat';
import {
  IMAGE_DECODE_TIMEOUT_MS,
  PROGRESSIVE_MAIN_DEFAULT_FADE_MS,
  toolbarZoomDropdownWidthPx,
  toolbarZoomLabelSlotPx,
  WHEEL_ACCUM_PIXELS_PER_STOP,
  WHEEL_MAX_STEPS_PER_DRAIN,
  WHEEL_PAGE_DELTA_SCALE,
  WHEEL_PIXEL_COALESCE_GAP_MS,
  WHEEL_PIXEL_COALESCE_MIN_DELTA,
  WHEEL_PIXEL_MOUSE_NOTCH_MAX,
  WHEEL_PIXEL_MOUSE_NOTCH_MIN,
} from './imagePreviewTuning';
import { resolveStrings } from './locale';
import {
  resolveDefaultGroupedFlatIndex,
  resolvePreviewImages,
  type FlattenedGroupSlice,
} from './flattenGroupedImages';
import type { ImageItem, ImagePreviewProps, ImagePreviewRef, NativePercent } from './types';
import { useImageTransform } from './useImageTransform';
import { useProgressiveMainImage } from './useProgressiveMainImage';
import { useZoomState } from './useZoomState';
import { nextAdaptiveZoom, adaptiveZoomLabel } from './adaptiveZoom';
import { useClickZoomGesture } from './useClickZoomGesture';

const DEFAULT_STOPS: NativePercent[] = [10, 25, 50, 75, 100, 150, 200];

/** Avoid duplicate `decode()` / timeout pairs when both `ref` and `onLoad` run for cached images. */
const revealDecodeScheduled = new WeakSet<HTMLImageElement>();

function scheduleRevealAfterDecode(img: HTMLImageElement, onReveal: () => void, timeoutMs: number): void {
  if (revealDecodeScheduled.has(img)) return;
  revealDecodeScheduled.add(img);
  let settled = false;
  const once = () => {
    if (settled) return;
    settled = true;
    onReveal();
  };
  const tid = window.setTimeout(once, timeoutMs);
  if (typeof img.decode === 'function') {
    img
      .decode()
      .then(() => {
        window.clearTimeout(tid);
        once();
      })
      .catch(() => {
        window.clearTimeout(tid);
        once();
      });
  } else {
    window.clearTimeout(tid);
    queueMicrotask(once);
  }
}

function normaliseImages(props: ImagePreviewProps): ImageItem[] {
  return resolvePreviewImages(props).images;
}

/** Find which slice the flat index falls into. Returns null if not grouped. */
function findGroup(
  slices: FlattenedGroupSlice[] | undefined,
  idx: number,
): { group: FlattenedGroupSlice; groupIdx: number } | null {
  if (!slices) return null;
  const groupIdx = slices.findIndex((g) => idx >= g.start && idx <= g.end);
  if (groupIdx === -1) return null;
  return { group: slices[groupIdx], groupIdx };
}

// ── Outer shell: only mounts the dialog when visible ───────────────────────
export const ImagePreview = forwardRef<ImagePreviewRef, ImagePreviewProps>(
  function ImagePreview(props, ref) {
    const images = normaliseImages(props);
    if (!props.visible || images.length === 0) return null;
    return <ImagePreviewInner {...props} ref={ref} />;
  },
);

// ── Inner dialog ───────────────────────────────────────────────────────────
const ImagePreviewInner = forwardRef<ImagePreviewRef, ImagePreviewProps>(
  function ImagePreviewInner(props, ref) {
    const {
      stops = DEFAULT_STOPS,
      initialMode = 'fit',
      initialNativePercent,
      firstZoomInStrategy = 'above-fit',
      zoomOutBelowMinBehaviour = 'noop',
      zoomInAtMaxBehaviour = 'noop',
      wheelEnabled = true,
      doubleClickEnabled = true,
      clickZoomEnabled = false,
      switchImageResetZoom = true,
      switchImageResetTransform = true,
      fitResetPan = true,
      defaultIndex = 0,
      showFlip = false,
      arrows = 'both',
      initialZoomLocked = false,
      showMinimap = true,
      progressiveMain = true,
      progressiveFadeMs = PROGRESSIVE_MAIN_DEFAULT_FADE_MS,
      onMainImageLoadStageChange,
      closeOnMaskClick = false,
      overlayClassName,
      overlayStyle,
      language,
      onClose,
      onZoomChange,
      onIndexChange,
      onMaxStopReached,
    } = props;

    // Resolve locale strings once; re-resolves only when `language` changes.
    const t = useMemo(() => resolveStrings(language), [language]);
    const zoomLabelSlotPx = useMemo(() => toolbarZoomLabelSlotPx(language), [language]);
    const zoomDropdownWidthPx = useMemo(() => toolbarZoomDropdownWidthPx(language), [language]);

    const { images, groupSlices } = useMemo(
      () => resolvePreviewImages(props),
      // Intentionally omit other props — only data fields affect the resolved list.
      // eslint-disable-next-line react-hooks/exhaustive-deps -- groupedImages, images, src, alt, minimap*
      [props.groupedImages, props.images, props.src, props.alt, props.minimapSrc, props.minimap],
    );

    const hasGroups = Array.isArray(groupSlices) && groupSlices.length > 0;
    // `arrows` only gates the side-of-image buttons. Toolbar prev/next are always on when `groupedImages` is used.
    const showSideArrows    = arrows === 'both' || arrows === 'side';
    const showToolbarArrows = hasGroups || arrows === 'both' || arrows === 'toolbar';
    const sortedStops = useMemo(() => [...stops].sort((a, b) => a - b), [stops]);

    const [currentIndex, setCurrentIndex] = useState(() => {
      if (hasGroups && props.defaultGroupedSelection && props.groupedImages?.length) {
        return resolveDefaultGroupedFlatIndex(props.groupedImages, props.defaultGroupedSelection);
      }
      return defaultIndex;
    });
    const [zoomLocked, setZoomLocked] = useState(initialZoomLocked);
    const [minimapDragging, setMinimapDragging] = useState(false);
    const overlayRef = useRef<HTMLDivElement>(null);

    // ── Zoom state machine ──────────────────────────────────────────────────
    const zoomState = useZoomState({
      stops: sortedStops,
      initialMode,
      initialNativePercent,
      firstZoomInStrategy,
      zoomOutBelowMinBehaviour,
      zoomInAtMaxBehaviour,
      onZoomChange,
      onMaxStopReached,
    });
    const { mode, nativePercent, zoomIn, zoomOut, fit, setNative, reset, peekZoomIn, peekZoomOut } = zoomState;

    // ── Image transform ─────────────────────────────────────────────────────
    const {
      transform,
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
    } = useImageTransform({ mode, nativePercent, fitResetPan, fitMaxNativePercent: clickZoomEnabled ? 100 : Infinity });

    // ── Current image ───────────────────────────────────────────────────────
    const currentImage = images[currentIndex] ?? images[0];

    const prevSrcRef = useRef(currentImage.src);
    useEffect(() => {
      if (prevSrcRef.current !== currentImage.src) {
        resetImageDims();
        prevSrcRef.current = currentImage.src;
      }
    }, [currentImage.src, resetImageDims]);

    const progressive = useProgressiveMainImage({
      mainSrc: currentImage.src,
      minimapSrc: currentImage.minimapSrc,
      minimapCustom: !!currentImage.minimap,
      enabled: progressiveMain,
      onImageLayout: onImageLoad,
      onStageChange: onMainImageLoadStageChange,
    });

    const { onMainImgDecoded } = progressive;

    const imgRefCallback = useCallback(
      (el: HTMLImageElement | null) => {
        if (el && el.complete && el.naturalWidth > 0) {
          onImageLoad({ naturalWidth: el.naturalWidth, naturalHeight: el.naturalHeight });
          scheduleRevealAfterDecode(el, onMainImgDecoded, IMAGE_DECODE_TIMEOUT_MS);
        }
      },
      [onImageLoad, onMainImgDecoded],
    );

    // ── Group info ──────────────────────────────────────────────────────────
    const groupInfo = useMemo(() => findGroup(groupSlices, currentIndex), [groupSlices, currentIndex]);
    const currentGroup   = groupInfo?.group ?? null;
    const currentGroupIdx = groupInfo?.groupIdx ?? -1;

    // ── Navigation ──────────────────────────────────────────────────────────
    const goTo = useCallback(
      (idx: number) => {
        setCurrentIndex(idx);
        onIndexChange?.(idx);
        // Reset zoom only when not locked (and when switchImageResetZoom allows it).
        if (switchImageResetZoom && !zoomLocked) reset();
        resetPan();
        if (switchImageResetTransform) resetOrientation();
      },
      [onIndexChange, reset, resetPan, resetOrientation, switchImageResetZoom, switchImageResetTransform, zoomLocked],
    );

    // Within-group (or global when flat) prev / next
    const prev = useCallback(() => {
      const boundary = currentGroup?.start ?? 0;
      if (currentIndex > boundary) goTo(currentIndex - 1);
    }, [currentIndex, currentGroup, goTo]);

    const next = useCallback(() => {
      const boundary = currentGroup?.end ?? images.length - 1;
      if (currentIndex < boundary) goTo(currentIndex + 1);
    }, [currentIndex, currentGroup, images.length, goTo]);

    // Jump to first image of previous / next group
    const prevGroup = useCallback(() => {
      if (groupSlices && currentGroupIdx > 0) goTo(groupSlices[currentGroupIdx - 1].start);
    }, [groupSlices, currentGroupIdx, goTo]);

    const nextGroup = useCallback(() => {
      if (groupSlices && currentGroupIdx < groupSlices.length - 1) goTo(groupSlices[currentGroupIdx + 1].start);
    }, [groupSlices, currentGroupIdx, goTo]);

    // ── Auto-fade overlay controls (inactivity-based) ───────────────────────
    // After 3 s of no mouse movement, clicks, or key presses, all controls
    // fade to a ghost opacity (10%) over 1.6 s. Any activity instantly
    // restores them (0.12 s).  Applies to: arrows, close button, toolbar,
    // filename badge.
    const [controlsVisible, setControlsVisible] = useState(true);
    const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const resetHideTimer = useCallback(() => {
      setControlsVisible(true);
      if (hideTimerRef.current !== null) clearTimeout(hideTimerRef.current);
      hideTimerRef.current = setTimeout(() => setControlsVisible(false), 3000);
    }, []);

    // Kick off the timer on mount; clean up on unmount.
    useEffect(() => {
      resetHideTimer();
      return () => {
        if (hideTimerRef.current !== null) clearTimeout(hideTimerRef.current);
      };
    }, [resetHideTimer]);

    // ── Wheel ───────────────────────────────────────────────────────────────
    // Track the live CSS scale between React renders.  When wheel events fire
    // faster than React can render (e.g. trackpad smooth scroll), the closure
    // value of `transform.scale` becomes stale after the first zoom.  Using a
    // ref that we update synchronously after every zoom event ensures s1 is
    // always the most-recently-applied scale, not the last-rendered one.
    const pendingScaleRef = useRef(transform.scale);
    useLayoutEffect(() => {
      pendingScaleRef.current = transform.scale;
    }, [transform.scale]);

    // Wheel zoom:
    // - LINE: each line ⇒ stops (±1 per slow detent).
    // - PIXEL, |deltaY| in notch band ⇒ one stop / event.
    // - PIXEL, small |deltaY| + long gap since last wheel ⇒ one stop (small‑increment mice).
    // - Else accumulate pixel/page deltas until |accum| ≥ threshold (smooth trackpads).
    //
    // Multi-stop bursts use `flushSync` so `useZoomState`’s `stateRef` updates between steps.
    const wheelAccumRef = useRef(0);
    const wheelDrainRafRef = useRef<number | null>(null);
    const wheelDrainStepRef = useRef<() => boolean>(() => false);
    const lastWheelClientRef = useRef({ x: 0, y: 0 });
    /** For coalescing slow, small pixel deltas into one stop per physical detent. */
    const lastWheelEventTimeRef = useRef(0);

    useEffect(
      () => () => {
        if (wheelDrainRafRef.current !== null) {
          cancelAnimationFrame(wheelDrainRafRef.current);
          wheelDrainRafRef.current = null;
        }
      },
      [],
    );

    const pixelOrPageDeltaY = (e: WheelEvent): number => {
      if (e.deltaMode === WheelEvent.DOM_DELTA_PAGE) return e.deltaY * WHEEL_PAGE_DELTA_SCALE;
      return e.deltaY;
    };

    const handleWheel = useCallback(
      (e: WheelEvent) => {
        if (!wheelEnabled) return;
        e.preventDefault();

        lastWheelClientRef.current = { x: e.clientX, y: e.clientY };

        const t = performance.now();
        const dtSinceLastWheel = t - lastWheelEventTimeRef.current;
        lastWheelEventTimeRef.current = t;

        const S = WHEEL_ACCUM_PIXELS_PER_STOP;
        const MAX = WHEEL_MAX_STEPS_PER_DRAIN;
        const notchMin = WHEEL_PIXEL_MOUSE_NOTCH_MIN;
        const notchMax = WHEEL_PIXEL_MOUSE_NOTCH_MAX;

        /** One physical `wheel` event must not advance multiple zoom-in stops from Fit (pixel drain / multi-line would chain 10%→…→100%). */
        const startedInFit = mode === 'fit';
        let zoomInStepsThisEvent = 0;

        const applyOneWheelStep = (directionIn: boolean): boolean => {
          if (startedInFit && directionIn && zoomInStepsThisEvent >= 1) {
            wheelAccumRef.current = 0;
            return false;
          }

          const peek = directionIn
            ? peekZoomIn(fitEquivalentNativePercent)
            : peekZoomOut();
          if (peek === null) {
            wheelAccumRef.current = 0;
            return false;
          }

          const rect = overlayRef.current?.getBoundingClientRect();
          const { x: clientX, y: clientY } = lastWheelClientRef.current;
          const cx = rect ? clientX - rect.left - rect.width / 2 : 0;
          const cy = rect ? clientY - rect.top - rect.height / 2 : 0;

          const s1 = pendingScaleRef.current;
          const s2 =
            peek.mode === 'fit'
              ? (fitEquivalentNativePercent ?? peek.percent) / 100
              : peek.percent / 100;

          runFlushSync(() => {
            zoomAnchorTranslate(s1, s2, cx, cy);
            pendingScaleRef.current = s2;
            if (directionIn) zoomIn(fitEquivalentNativePercent);
            else zoomOut(fitEquivalentNativePercent);
          });
          if (startedInFit && directionIn) zoomInStepsThisEvent++;
          return true;
        };

        // ── Line-based wheels / browsers: slow scroll still sends ~±1 line per detent ──
        if (e.deltaMode === WheelEvent.DOM_DELTA_LINE && e.deltaY !== 0) {
          const nLines = Math.min(MAX, Math.max(1, Math.round(Math.abs(e.deltaY))));
          const directionIn = e.deltaY < 0;
          for (let i = 0; i < nLines; i++) {
            if (!applyOneWheelStep(directionIn)) break;
          }
          return;
        }

        // ── Pixel mode: “big notch” band, or slow small‑delta detents, else accumulate ──
        if (e.deltaMode === WheelEvent.DOM_DELTA_PIXEL) {
          const ady = Math.abs(e.deltaY);
          if (ady >= notchMin && ady <= notchMax && e.deltaY !== 0) {
            wheelAccumRef.current = 0;
            applyOneWheelStep(e.deltaY < 0);
            return;
          }
          if (
            e.deltaY !== 0 &&
            ady >= WHEEL_PIXEL_COALESCE_MIN_DELTA &&
            ady < notchMin &&
            dtSinceLastWheel >= WHEEL_PIXEL_COALESCE_GAP_MS
          ) {
            wheelAccumRef.current = 0;
            applyOneWheelStep(e.deltaY < 0);
            return;
          }
        }

        wheelAccumRef.current += pixelOrPageDeltaY(e);

        const drainOnce = (): boolean => {
          const a = wheelAccumRef.current;
          if (Math.abs(a) < S) return false;

          const directionIn = a < 0;
          if (directionIn && a > -S) return false;
          if (!directionIn && a < S) return false;

          if (!applyOneWheelStep(directionIn)) return false;

          wheelAccumRef.current += directionIn ? S : -S;
          return true;
        };

        wheelDrainStepRef.current = drainOnce;

        const runDrain = () => {
          let s = 0;
          while (s < MAX && wheelDrainStepRef.current()) s++;
        };
        runDrain();

        const scheduleMore = () => {
          if (Math.abs(wheelAccumRef.current) < S) return;
          if (wheelDrainRafRef.current !== null) return;
          wheelDrainRafRef.current = requestAnimationFrame(() => {
            wheelDrainRafRef.current = null;
            runDrain();
            scheduleMore();
          });
        };
        scheduleMore();
      },
      [
        wheelEnabled, mode, zoomIn, zoomOut, peekZoomIn, peekZoomOut,
        fitEquivalentNativePercent, zoomAnchorTranslate,
      ],
    );

    useEffect(() => {
      const el = overlayRef.current;
      if (!el) return;
      el.addEventListener('wheel', handleWheel, { passive: false });
      return () => el.removeEventListener('wheel', handleWheel);
    }, [handleWheel]);

    const mediaViewportRef = useRef<HTMLDivElement>(null);
    const setMediaViewport = useCallback((el: HTMLDivElement | null) => {
      mediaViewportRef.current = el;
      setContainerEl(el);
    }, [setContainerEl]);
    const [zoomHint, setZoomHint] = useState('');
    const hintTimer = useRef<ReturnType<typeof setTimeout>>();
    useEffect(() => {
      setZoomHint('');
      return () => clearTimeout(hintTimer.current);
    }, [currentImage.src]);
    const cycleZoom = useCallback((point?: { x: number; y: number }) => {
      if (!imageDims || !containerSize) return;
      const target = nextAdaptiveZoom(zoomState.getState(fitEquivalentNativePercent));
      const rect = mediaViewportRef.current?.getBoundingClientRect();
      runFlushSync(() => {
        if (target.mode === 'fit') {
          fit();
        } else {
          zoomAnchorTranslate(transform.scale, target.percent / 100,
            point && rect ? point.x - rect.left - rect.width / 2 : 0,
            point && rect ? point.y - rect.top - rect.height / 2 : 0);
          setNative(target.percent);
        }
      });
      const next = nextAdaptiveZoom({mode: target.mode, nativePercent: target.mode === 'native' ? target.percent : 100, fitEquivalentNativePercent});
      setZoomHint(`${adaptiveZoomLabel(target)} → ${adaptiveZoomLabel(next)}${target.mode === 'native' ? ' · Drag to pan' : ''}`);
      clearTimeout(hintTimer.current);
      hintTimer.current = setTimeout(() => setZoomHint(''), 900);
    }, [imageDims, containerSize, zoomState, fitEquivalentNativePercent, fit, setNative, zoomAnchorTranslate, transform.scale]);
    const clickGesture = useClickZoomGesture({
      enabled: clickZoomEnabled && Boolean(imageDims && containerSize),
      resourceKey: currentImage.src,
      mode,
      onCycle: cycleZoom,
      onPanStart,
      onPanMove,
      onPanEnd,
    });
    const nextClickZoom = nextAdaptiveZoom({mode, nativePercent, fitEquivalentNativePercent});
    const nextClickScale = nextClickZoom.mode === 'native' ? nextClickZoom.percent / 100 : (fitEquivalentNativePercent ?? 100) / 100;

    // ── Keyboard ────────────────────────────────────────────────────────────
    useEffect(() => {
      const onKeyDown = (e: KeyboardEvent) => {
        // Any key press wakes up the controls.
        resetHideTimer();

        // Let the zoom-input field handle its own keys without interference.
        const target = e.target as HTMLElement;
        if (e.defaultPrevented || target.isContentEditable || target.closest('input,textarea,select,[contenteditable="true"]')) return;

        const mod = e.ctrlKey || e.metaKey;

        switch (e.key) {
          case 'Escape':
            onClose?.();
            break;

          // Zoom in: + = ↑
          case '+':
          case '=':
          case 'ArrowUp':
            e.preventDefault();
            zoomIn(fitEquivalentNativePercent);
            break;

          // Zoom out: - ↓
          case '-':
          case 'ArrowDown':
            e.preventDefault();
            zoomOut(fitEquivalentNativePercent);
            break;

          // Fit / 100%
          case '0': fit(); break;
          case '1': setNative(100); break;

          // Space: toggle fit ↔ 100% (same as double-click)
          case ' ':
            if (e.ctrlKey || e.metaKey || e.altKey || target.closest('button,[role="button"]')) return;
            e.preventDefault();
            if (e.repeat) return;
            if (clickZoomEnabled) cycleZoom();
            else if (mode === 'fit') setNative(100);
            else fit();
            break;

          // Navigate images / rotate (Ctrl/Cmd modifier)
          case 'ArrowLeft':
            e.preventDefault();
            if (mod) {
              rotateCCW();
            } else {
              // When at the first image of a group and a previous group exists,
              // arrow key mirrors the side "prev-group" double-chevron button.
              const atStart = currentGroup ? currentIndex === currentGroup.start : currentIndex === 0;
              if (atStart && currentGroupIdx > 0) prevGroup(); else prev();
            }
            break;
          case 'ArrowRight':
            e.preventDefault();
            if (mod) {
              rotateCW();
            } else {
              // When at the last image of a group and a next group exists,
              // arrow key mirrors the side "next-group" double-chevron button.
              const atEnd = currentGroup ? currentIndex === currentGroup.end : currentIndex === images.length - 1;
              const hasNext = groupSlices ? currentGroupIdx < groupSlices.length - 1 : false;
              if (atEnd && hasNext) nextGroup(); else next();
            }
            break;

          // Group navigation
          case 'PageUp':   e.preventDefault(); prevGroup(); break;
          case 'PageDown': e.preventDefault(); nextGroup(); break;
        }
      };
      window.addEventListener('keydown', onKeyDown);
      return () => window.removeEventListener('keydown', onKeyDown);
    }, [
      zoomIn, zoomOut, fit, setNative, mode,
      prev, next, prevGroup, nextGroup,
      rotateCW, rotateCCW,
      onClose, fitEquivalentNativePercent,
      resetHideTimer,
      clickZoomEnabled, cycleZoom,
      // boundary-jump deps
      currentIndex, currentGroup, currentGroupIdx, groupSlices, images.length,
    ]);

    // ── Double-click ────────────────────────────────────────────────────────
    const handleDoubleClick = useCallback(() => {
      if (!doubleClickEnabled || clickZoomEnabled) return;
      if (mode === 'fit') setNative(100);
      else fit();
    }, [doubleClickEnabled, clickZoomEnabled, mode, fit, setNative]);

    // ── Focus ───────────────────────────────────────────────────────────────
    useEffect(() => { overlayRef.current?.focus(); }, []);

    // ── Imperative ref ──────────────────────────────────────────────────────
    useImperativeHandle(ref, () => ({
      zoomIn: () => zoomIn(fitEquivalentNativePercent),
      zoomOut: () => zoomOut(fitEquivalentNativePercent),
      fit,
      setNative,
      rotateCW,
      rotateCCW,
      flipHorizontal,
      flipVertical,
      next,
      prev,
      nextGroup,
      prevGroup,
      getState: () => zoomState.getState(fitEquivalentNativePercent),
    }), [zoomIn, zoomOut, fit, setNative, rotateCW, rotateCCW, flipHorizontal, flipVertical,
        next, prev, nextGroup, prevGroup, zoomState, fitEquivalentNativePercent]);

    // ── Derived ─────────────────────────────────────────────────────────────
    const atMinStop = mode === 'native' && nativePercent <= sortedStops[0];
    const atMaxStop = mode === 'native' && nativePercent >= sortedStops[sortedStops.length - 1];
    const ready     = imageDims !== null && containerSize !== null;

    // ── Prevent the "shrink on first load" animation bug ─────────────────────
    // When ready flips from false→true, the CSS transform has just jumped to the
    // correct fit-scale in the same render.  If we make the image visible in
    // that same render, the `transform` transition fires and produces a visible
    // "zoom-out" animation.  Instead we keep opacity:0 for one animation frame
    // (so the browser paints the correct transform while the image is still
    // invisible), then set imageShowReady→true so only the opacity transitions.
    const [imageShowReady, setImageShowReady] = useState(false);
    useEffect(() => {
      if (!ready) { setImageShowReady(false); return; }
      const id = requestAnimationFrame(() => setImageShowReady(true));
      return () => cancelAnimationFrame(id);
    }, [ready]);

    // ── Loading indicator ────────────────────────────────────────────────────
    // Only show the spinner if loading takes longer than LOADER_DELAY_MS.
    // This avoids a distracting flash for fast-loading images (e.g. local
    // files in a VSCode webview) while still signalling progress for large
    // images that take several hundred milliseconds or more.
    const LOADER_DELAY_MS = 300;
    const [showLoader, setShowLoader] = useState(false);
    useEffect(() => {
      if (imageShowReady) { setShowLoader(false); return; }
      const id = setTimeout(() => setShowLoader(true), LOADER_DELAY_MS);
      return () => clearTimeout(id);
    }, [imageShowReady]);

    const [delayedPreloadSpinner, setDelayedPreloadSpinner] = useState(false);
    useEffect(() => {
      if (!progressive.pipelineActive || progressive.preloadStage !== 'preloading') {
        setDelayedPreloadSpinner(false);
        return;
      }
      const id = setTimeout(() => setDelayedPreloadSpinner(true), LOADER_DELAY_MS);
      return () => clearTimeout(id);
    }, [progressive.pipelineActive, progressive.preloadStage]);

    /** Minimap bitmap is on screen while main is still decoding — no empty black viewport. */
    const thumbHoldingMainArea =
      progressive.pipelineActive &&
      progressive.showMinimapUnderlay &&
      !progressive.fullDecoded;

    /** Same window as thumb-on-main: no `transform` easing (avoids “huge image shrinking into fit”). */
    const suppressTransformTransition = thumbHoldingMainArea;

    /** Progressive: spinner stays on top of the thumbnail until the real main bitmap replaces it. */
    const progressiveWaitingFullOverThumb =
      progressive.pipelineActive && progressive.showMinimapUnderlay && !progressive.fullDecoded;

    const progressivePreloadSpinnerNoThumbYet =
      progressive.pipelineActive &&
      !progressive.showMinimapUnderlay &&
      progressive.preloadStage === 'preloading' &&
      delayedPreloadSpinner;

    const showCenterLoader =
      progressiveWaitingFullOverThumb ||
      progressivePreloadSpinnerNoThumbYet ||
      (!progressive.pipelineActive && showLoader) ||
      (progressive.pipelineActive && progressive.preloadStage === 'error' && showLoader);

    const hideMainUntilDecoded =
      progressive.pipelineActive &&
      !progressive.fullDecoded &&
      progressive.preloadStage !== 'thumb-only';
    const opacityTransition =
      progressive.pipelineActive && progressiveFadeMs > 0
        ? `opacity ${progressiveFadeMs}ms ease`
        : 'none';

    // Group-aware toolbar props
    const groupToolbarProps = currentGroup
      ? {
          groupCurrentIndex: currentIndex - currentGroup.start + 1,
          groupTotal:        currentGroup.end - currentGroup.start + 1,
          atGroupStart:      currentIndex === currentGroup.start,
          atGroupEnd:        currentIndex === currentGroup.end,
          hasPrevGroup:      currentGroupIdx > 0,
          hasNextGroup:      groupSlices ? currentGroupIdx < groupSlices.length - 1 : false,
          groupName:         currentGroup.name,
          onPrevGroup:       prevGroup,
          onNextGroup:       nextGroup,
        }
      : {};

    return (
      <div
        ref={overlayRef}
        role="dialog"
        aria-modal="true"
        aria-label={t.imagePreview}
        tabIndex={-1}
        className={overlayClassName}
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 9999,
          /* macOS-style frosted glass: semi-transparent + blur */
          background: 'rgba(10, 12, 20, 0.70)',
          backdropFilter: 'blur(24px) saturate(160%)',
          WebkitBackdropFilter: 'blur(24px) saturate(160%)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          outline: 'none',
          ...overlayStyle,
        }}
        onClick={(e) => { if (closeOnMaskClick && e.target === e.currentTarget) onClose?.(); }}
        onMouseMove={resetHideTimer}
        onMouseDown={resetHideTimer}
      >
        {/* ── Close button — top-right corner ── */}
        <CloseButton
          onClick={() => onClose?.()}
          visible={controlsVisible}
          label={t.close}
          tip={t.tipClose}
        />

        {/* ── Viewport ── */}
        {/* NOTE: This div is 100 % × 100 % and covers the whole overlay, so mask
            clicks land here (not on the overlay root). We mirror the same check. */}
        <div
          ref={setMediaViewport}
          onClickCapture={clickGesture.onClickCapture}
          onClick={(e) => { if (closeOnMaskClick && e.target === e.currentTarget) onClose?.(); }}
          style={{
            position: 'relative',
            width: '100%',
            height: '100%',
            overflow: 'hidden',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <div
            style={{
              position: 'relative',
              width:     imageDims ? imageDims.naturalWidth  : 'auto',
              height:    imageDims ? imageDims.naturalHeight : 'auto',
              maxWidth:  imageDims ? 'none' : '100%',
              maxHeight: imageDims ? 'none' : '100%',
              transform: transform.cssTransform,
              transformOrigin: 'center center',
              transition: clickZoomEnabled || isPanning || minimapDragging
                ? 'none'
                : !imageShowReady
                  ? 'opacity 0.15s ease'
                  : suppressTransformTransition
                    ? 'opacity 0.15s ease'
                    : 'transform 0.3s ease, opacity 0.15s ease',
              opacity: imageShowReady ? 1 : 0,
              cursor: clickZoomEnabled
                ? clickGesture.dragging ? 'grabbing' : nextClickScale > transform.scale ? 'zoom-in' : 'zoom-out'
                : mode === 'native' ? 'grab' : 'zoom-in',
              userSelect: 'none',
              touchAction: 'none',
            }}
            data-preview-media
            onPointerDown={clickGesture.onPointerDown}
            onPointerMove={clickGesture.onPointerMove}
            onPointerUp={clickGesture.onPointerUp}
            onPointerCancel={clickGesture.onPointerCancel}
            onLostPointerCapture={clickGesture.onPointerCancel}
            onDoubleClick={handleDoubleClick}
          >
            {progressive.showMinimapUnderlay &&
              currentImage.minimapSrc && (
                <img
                  key={`${currentImage.minimapSrc}-${currentIndex}`}
                  src={currentImage.minimapSrc}
                  alt=""
                  aria-hidden
                  draggable={false}
                  style={{
                    position:      'absolute',
                    inset:         0,
                    width:         '100%',
                    height:        '100%',
                    objectFit:     'fill',
                    pointerEvents: 'none',
                    display:       'block',
                    opacity:
                      progressive.preloadStage === 'thumb-only'
                        ? 1
                        : progressive.fullDecoded
                          ? 0
                          : 1,
                    transition:    opacityTransition,
                  }}
                />
              )}
            {progressive.preloadStage !== 'thumb-only' && (
              <img
                key={currentImage.src}
                src={currentImage.src}
                alt={currentImage.alt ?? ''}
                draggable={false}
                ref={imgRefCallback}
                onLoad={(e) => {
                  const img = e.currentTarget;
                  onImageLoad({ naturalWidth: img.naturalWidth, naturalHeight: img.naturalHeight });
                  scheduleRevealAfterDecode(img, onMainImgDecoded, IMAGE_DECODE_TIMEOUT_MS);
                }}
                onError={() => {
                  onMainImgDecoded();
                }}
                style={{
                  position:      'relative',
                  display:       'block',
                  width:         imageDims ? imageDims.naturalWidth : 'auto',
                  height:        imageDims ? imageDims.naturalHeight : 'auto',
                  maxWidth:      imageDims ? 'none' : '100%',
                  maxHeight:     imageDims ? 'none' : '100%',
                  pointerEvents: 'none',
                  opacity:       hideMainUntilDecoded ? 0 : 1,
                  transition:    opacityTransition,
                }}
              />
            )}
          </div>

          {/* ── Loading spinner ── */}
          {/* Keyframes are defined inline once; harmless to repeat on re-mount. */}
          <style>{`@keyframes _rip_spin{to{transform:rotate(360deg)}}`}</style>
          <div
            aria-label={t.loadingImage}
            aria-live="polite"
            style={{
              position:      'absolute',
              inset:         0,
              zIndex:        1,
              display:       'flex',
              alignItems:    'center',
              justifyContent:'center',
              pointerEvents: 'none',
              opacity:       showCenterLoader ? 1 : 0,
              transition:    showCenterLoader ? 'none' : 'opacity 0.2s ease',
            }}
          >
            <div style={{
              width:         28,
              height:        28,
              borderRadius:  '50%',
              border:        '2.5px solid rgba(180, 200, 230, 0.12)',
              borderTopColor:'rgba(180, 200, 230, 0.55)',
              animation:     '_rip_spin 0.75s linear infinite',
            }} />
          </div>
        </div>

        {zoomHint && (
          <div role='status' style={{position:'absolute', bottom:100, left:'50%', transform:'translateX(-50%)', padding:'8px 12px', borderRadius:6, background:'rgba(0,0,0,.7)', color:'#fff', fontSize:12, pointerEvents:'none'}}>{zoomHint}</div>
        )}
        {showMinimap && imageDims && containerSize && (
          <Minimap
            imageSrc={currentImage.minimapSrc ?? currentImage.src}
            thumbnail={currentImage.minimap}
            imageAlt={currentImage.alt ?? ''}
            nw={imageDims.naturalWidth}
            nh={imageDims.naturalHeight}
            cw={containerSize.width}
            ch={containerSize.height}
            scale={transform.scale}
            mode={mode}
            tx={transform.translateX}
            ty={transform.translateY}
            rotationDeg={transform.rotation}
            flipH={transform.flipH}
            flipV={transform.flipV}
            controlsVisible={controlsVisible}
            onPanByDelta={panByDelta}
            onJumpToNatural={panJumpToNatural}
            onUserActivity={resetHideTimer}
            onDragChange={setMinimapDragging}
            ariaLabel={t.minimapNav}
            minimapTooltip={t.tipMinimap}
          />
        )}

        {/* ── Side nav arrows ────────────────────────────────────────────────
             Rules:
             · Arrow only renders when navigation is possible — never grayed-out.
             · At a group boundary with an adjacent group: swap the arrow for a
               "jump to next/prev group" button (double-chevron icon).
             · Single group: hide when at the first / last image. ── */}
        {(() => {
          if (!showSideArrows) return null;
          const isAtStart = currentGroup
            ? currentIndex === currentGroup.start
            : currentIndex === 0;
          const isAtEnd = currentGroup
            ? currentIndex === currentGroup.end
            : currentIndex === images.length - 1;
          const hasPrevGroupNav = !!(currentGroup && currentGroupIdx > 0);
          const hasNextGroupNav = !!(currentGroup && groupSlices && currentGroupIdx < groupSlices.length - 1);

          const showLeft  = !isAtStart || hasPrevGroupNav;
          const showRight = !isAtEnd   || hasNextGroupNav;
          const leftIsGroup  = isAtStart && hasPrevGroupNav;
          const rightIsGroup = isAtEnd   && hasNextGroupNav;

          return (
            <>
              {showLeft && (
                <NavArrow
                  direction="left"
                  isGroupJump={leftIsGroup}
                  onClick={leftIsGroup ? prevGroup : prev}
                  label={leftIsGroup ? t.prevGroup : t.prev}
                  tip={leftIsGroup ? t.tipPrevGroup : t.tipPrev}
                  visible={controlsVisible}
                />
              )}
              {showRight && (
                <NavArrow
                  direction="right"
                  isGroupJump={rightIsGroup}
                  onClick={rightIsGroup ? nextGroup : next}
                  label={rightIsGroup ? t.nextGroup : t.next}
                  tip={rightIsGroup ? t.tipNextGroup : t.tipNext}
                  visible={controlsVisible}
                />
              )}
            </>
          );
        })()}

        <Toolbar
          controlsVisible={controlsVisible}
          mode={mode}
          nativePercent={nativePercent}
          fitEquivalentNativePercent={fitEquivalentNativePercent}
          stops={sortedStops}
          atMinStop={atMinStop}
          atMaxStop={atMaxStop}
          totalImages={images.length}
          currentIndex={currentIndex}
          imageName={currentImage.name}
          showFlip={showFlip}
          showToolbarArrows={showToolbarArrows}
          zoomLocked={zoomLocked}
          strings={t}
          zoomLabelSlotPx={zoomLabelSlotPx}
          zoomDropdownWidthPx={zoomDropdownWidthPx}
          onToggleLock={() => setZoomLocked((v) => !v)}
          onZoomIn={() => zoomIn(fitEquivalentNativePercent)}
          onZoomOut={() => zoomOut(fitEquivalentNativePercent)}
          onFit={fit}
          onOneToOne={() => setNative(100)}
          onSetNative={setNative}
          onRotateCW={rotateCW}
          onRotateCCW={rotateCCW}
          onFlipH={flipHorizontal}
          onFlipV={flipVertical}
          onPrev={prev}
          onNext={next}
          {...groupToolbarProps}
        />
      </div>
    );
  },
);

// ── Close button ───────────────────────────────────────────────────────────

function CloseButton({
  onClick,
  visible,
  label,
  tip,
}: {
  onClick(): void;
  visible: boolean;
  label: string;
  tip: string;
}) {
  const [hover, setHover] = useState(false);
  return (
    <DelayedTooltip content={tip}>
      <button
        type="button"
        aria-label={label}
        onClick={onClick}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        style={{
          position: 'absolute',
          top: 14,
          right: 16,
          zIndex: 20,
          width: 46,
          height: 46,
          borderRadius: '50%',
          border: '1px solid rgba(255,255,255,0.22)',
          background: hover ? 'rgba(8,14,26,0.78)' : 'rgba(8,14,26,0.50)',
          backdropFilter: 'blur(6px)',
          WebkitBackdropFilter: 'blur(6px)',
          boxShadow: '0 2px 12px rgba(0,0,0,0.45)',
          color: 'rgba(235,242,255,0.92)',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          opacity: visible ? 1 : 0.10,
          transition: visible
            ? 'opacity 0.12s ease, background 0.15s'
            : 'opacity 1.6s ease, background 0.15s',
          flexShrink: 0,
        }}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}
          width={18} height={18} aria-hidden="true">
          <line x1="18" y1="6" x2="6"  y2="18"/>
          <line x1="6"  y1="6" x2="18" y2="18"/>
        </svg>
      </button>
    </DelayedTooltip>
  );
}

// ── Side nav arrow ─────────────────────────────────────────────────────────

interface NavArrowProps {
  direction: 'left' | 'right';
  /** When true the icon becomes a double-chevron (group jump). */
  isGroupJump?: boolean;
  onClick(): void;
  label: string;
  tip: string;
  visible: boolean;
}

function NavArrow({ direction, isGroupJump = false, onClick, label, tip, visible }: NavArrowProps) {
  const [hover, setHover] = useState(false);

  return (
    <DelayedTooltip content={tip}>
      <button
        type="button"
        aria-label={label}
        onClick={onClick}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        style={{
          position: 'absolute',
          top: '50%',
          [direction]: 16,
          transform: 'translateY(-50%)',
          width: 44,
          height: 44,
          borderRadius: '50%',
          border: '1px solid rgba(255,255,255,0.28)',
          background: hover ? 'rgba(8,14,26,0.80)' : 'rgba(8,14,26,0.52)',
          backdropFilter: 'blur(6px)',
          WebkitBackdropFilter: 'blur(6px)',
          boxShadow: '0 2px 16px rgba(0,0,0,0.55)',
          color: 'rgba(235,242,255,0.92)',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 10,
          opacity: visible ? 1 : 0.10,
          transition: visible
            ? 'opacity 0.12s ease, background 0.15s, box-shadow 0.15s'
            : 'opacity 1.6s ease, background 0.15s, box-shadow 0.15s',
        }}
      >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
        strokeWidth={2.5} width={22} height={22} aria-hidden="true">
        {direction === 'left'
          ? isGroupJump
            ? <><polyline points="19,18 13,12 19,6"/><polyline points="11,18 5,12 11,6"/></>
            : <polyline points="15,18 9,12 15,6"/>
          : isGroupJump
            ? <><polyline points="5,18 11,12 5,6"/><polyline points="13,18 19,12 13,6"/></>
            : <polyline points="9,18 15,12 9,6"/>
        }
      </svg>
    </button>
    </DelayedTooltip>
  );
}
