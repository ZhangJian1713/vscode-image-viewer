import { useCallback, useRef, useState } from 'react';
import type {
  FirstZoomInStrategy,
  NativePercent,
  ZoomInAtMaxBehaviour,
  ZoomMode,
  ZoomOutBelowMinBehaviour,
  ZoomState,
} from './types';

export interface ZoomStateOptions {
  stops: NativePercent[];
  initialMode: ZoomMode;
  initialNativePercent?: NativePercent;
  firstZoomInStrategy: FirstZoomInStrategy;
  zoomOutBelowMinBehaviour: ZoomOutBelowMinBehaviour;
  zoomInAtMaxBehaviour: ZoomInAtMaxBehaviour;
  onZoomChange?: (state: ZoomState) => void;
  onMaxStopReached?: () => void;
}

export interface ZoomStateActions {
  mode: ZoomMode;
  nativePercent: NativePercent;
  zoomIn(fitEquivalentNativePercent?: number): void;
  zoomOut(fitEquivalentNativePercent?: number): void;
  fit(): void;
  setNative(percent: NativePercent): void;
  reset(): void;
  getState(fitEquivalentNativePercent?: number): ZoomState;
  /** Returns what the next zoom-in state would be WITHOUT applying it. */
  peekZoomIn(fitEquivalentNativePercent?: number): { mode: ZoomMode; percent: NativePercent } | null;
  /** Returns what the next zoom-out state would be WITHOUT applying it. */
  peekZoomOut(): { mode: ZoomMode; percent: NativePercent } | null;
}

function clampToStops(percent: NativePercent, stops: NativePercent[]): NativePercent {
  if (stops.includes(percent)) return percent;
  // Snap to nearest stop
  return stops.reduce((prev, curr) =>
    Math.abs(curr - percent) < Math.abs(prev - percent) ? curr : prev,
  );
}

export function useZoomState(options: ZoomStateOptions): ZoomStateActions {
  const {
    stops,
    initialMode,
    initialNativePercent,
    firstZoomInStrategy,
    zoomOutBelowMinBehaviour,
    zoomInAtMaxBehaviour,
    onZoomChange,
    onMaxStopReached,
  } = options;

  const sortedStops = [...stops].sort((a, b) => a - b);
  const minStop = sortedStops[0];
  const maxStop = sortedStops[sortedStops.length - 1];

  const resolveInitialNative = (): NativePercent => {
    if (initialNativePercent !== undefined) {
      return clampToStops(initialNativePercent, sortedStops);
    }
    return minStop;
  };

  const [mode, setMode] = useState<ZoomMode>(initialMode);
  const [nativePercent, setNativePercent] = useState<NativePercent>(resolveInitialNative);

  // Keep a ref to avoid stale closures in callbacks
  const stateRef = useRef({ mode, nativePercent });
  stateRef.current = { mode, nativePercent };

  const notify = useCallback(
    (nextMode: ZoomMode, nextNative: NativePercent, fitEquiv?: number) => {
      onZoomChange?.({
        mode: nextMode,
        nativePercent: nextNative,
        fitEquivalentNativePercent: fitEquiv,
      });
    },
    [onZoomChange],
  );

  const fit = useCallback(() => {
    setMode('fit');
    notify('fit', stateRef.current.nativePercent);
  }, [notify]);

  const setNative = useCallback(
    (percent: NativePercent) => {
      // Accept any positive value — do NOT snap to stops.
      // Stops are only used by zoomIn/zoomOut increment logic.
      setMode('native');
      setNativePercent(percent);
      notify('native', percent);
    },
    [notify],
  );

  const zoomIn = useCallback(
    (fitEquivalentNativePercent?: number) => {
      const { mode: currentMode, nativePercent: currentNative } = stateRef.current;

      if (currentMode === 'fit') {
        // Entering native from fit
        let targetStop: NativePercent;
        if (firstZoomInStrategy === 'hundred') {
          targetStop = clampToStops(100, sortedStops);
        } else if (firstZoomInStrategy === 'first-stop') {
          targetStop = minStop;
        } else {
          // 'above-fit': smallest stop strictly greater than fit-equivalent
          const equiv = fitEquivalentNativePercent ?? 0;
          const above = sortedStops.find((s) => s > equiv);
          targetStop = above ?? maxStop;
        }
        setMode('native');
        setNativePercent(targetStop);
        notify('native', targetStop, fitEquivalentNativePercent);
        return;
      }

      // Already in native mode → go to next stop above current
      const idx = sortedStops.findIndex((s) => s >= currentNative);
      const currentIdx = sortedStops[idx] === currentNative ? idx : idx - 1;
      const nextIdx = currentIdx + 1;

      if (nextIdx >= sortedStops.length) {
        // Already at max
        if (zoomInAtMaxBehaviour === 'notify') {
          onMaxStopReached?.();
        }
        return;
      }

      const nextStop = sortedStops[nextIdx];
      setNativePercent(nextStop);
      notify('native', nextStop, fitEquivalentNativePercent);
    },
    [
      sortedStops,
      minStop,
      maxStop,
      firstZoomInStrategy,
      zoomInAtMaxBehaviour,
      onMaxStopReached,
      notify,
    ],
  );

  const zoomOut = useCallback(
    (fitEquivalentNativePercent?: number) => {
      const { mode: currentMode, nativePercent: currentNative } = stateRef.current;

      if (currentMode === 'fit') {
        // Already at fit, nothing to do
        return;
      }

      // Find the largest stop strictly below current
      const below = [...sortedStops].reverse().find((s) => s < currentNative);

      if (below === undefined) {
        // Already at or below minimum stop
        if (zoomOutBelowMinBehaviour === 'fit') {
          setMode('fit');
          notify('fit', currentNative, fitEquivalentNativePercent);
        }
        return;
      }

      if (below < minStop) {
        if (zoomOutBelowMinBehaviour === 'fit') {
          setMode('fit');
          notify('fit', currentNative, fitEquivalentNativePercent);
        }
        return;
      }

      setNativePercent(below);
      notify('native', below, fitEquivalentNativePercent);
    },
    [sortedStops, minStop, zoomOutBelowMinBehaviour, notify],
  );

  const peekZoomIn = useCallback(
    (fitEquivalentNativePercent?: number): { mode: ZoomMode; percent: NativePercent } | null => {
      const { mode: m, nativePercent: np } = stateRef.current;
      if (m === 'fit') {
        let targetStop: NativePercent;
        if (firstZoomInStrategy === 'hundred') {
          targetStop = clampToStops(100, sortedStops);
        } else if (firstZoomInStrategy === 'first-stop') {
          targetStop = minStop;
        } else {
          const equiv = fitEquivalentNativePercent ?? 0;
          const above = sortedStops.find((s) => s > equiv);
          targetStop = above ?? maxStop;
        }
        return { mode: 'native', percent: targetStop };
      }
      const idx = sortedStops.findIndex((s) => s >= np);
      const currentIdx = sortedStops[idx] === np ? idx : idx - 1;
      const nextIdx = currentIdx + 1;
      if (nextIdx >= sortedStops.length) return null;
      return { mode: 'native', percent: sortedStops[nextIdx] };
    },
    [sortedStops, minStop, maxStop, firstZoomInStrategy],
  );

  const peekZoomOut = useCallback(
    (): { mode: ZoomMode; percent: NativePercent } | null => {
      const { mode: m, nativePercent: np } = stateRef.current;
      if (m === 'fit') return null;
      const below = [...sortedStops].reverse().find((s) => s < np);
      if (below === undefined || below < minStop) {
        if (zoomOutBelowMinBehaviour === 'fit') return { mode: 'fit', percent: np };
        return null;
      }
      return { mode: 'native', percent: below };
    },
    [sortedStops, minStop, zoomOutBelowMinBehaviour],
  );

  const reset = useCallback(() => {
    setMode(initialMode);
    setNativePercent(resolveInitialNative());
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialMode, initialNativePercent]);

  const getState = useCallback(
    (fitEquivalentNativePercent?: number): ZoomState => ({
      mode: stateRef.current.mode,
      nativePercent: stateRef.current.nativePercent,
      fitEquivalentNativePercent,
    }),
    [],
  );

  return { mode, nativePercent, zoomIn, zoomOut, fit, setNative, reset, getState, peekZoomIn, peekZoomOut };
}
