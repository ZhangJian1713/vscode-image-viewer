import * as ReactDOM from 'react-dom';

type FlushSync = (fn: () => void) => void;

/**
 * React 18+ `flushSync`: forces updates inside `fn` before continuing (needed for multi-step wheel zoom).
 * React 17: `flushSync` is missing — run `fn` synchronously; rare edge cases in fast wheel bursts may differ.
 */
export const runFlushSync: FlushSync = (() => {
  const fs = (ReactDOM as typeof ReactDOM & { flushSync?: FlushSync }).flushSync;
  if (typeof fs === 'function') return fs;
  return (fn: () => void) => {
    fn();
  };
})();
