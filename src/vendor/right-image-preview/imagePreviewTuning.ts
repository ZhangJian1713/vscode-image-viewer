/**
 * Image preview — numeric tuning (pan visibility clamps, minimap Jacobian, etc.).
 * Prefer editing this file over scattering magic numbers across components.
 */

// ── Progressive main image (`minimapSrc` placeholder → full `src`) ───────────

/** Default crossfade (ms) when revealing the full image; `0` = instant (no flash). */
export const PROGRESSIVE_MAIN_DEFAULT_FADE_MS = 0;

/**
 * `HTMLImageElement.decode()` can hang on very large bitmaps; after this timeout we still reveal
 * the main layer (image is already `complete` from `onLoad`).
 */
export const IMAGE_DECODE_TIMEOUT_MS = 60_000;

/**
 * `new Image()` preload for dimensions — if neither `load` nor `error` fires (e.g. extreme
 * payloads), fall back so the visible &lt;img&gt; can still drive layout.
 */
export const PROGRESSIVE_PRELOAD_TIMEOUT_MS = 180_000;

/**
 * Minimum time the minimap thumbnail stays visible before swapping to the full image (progressive
 * pipeline). Avoids skipping the thumbnail when the full image is served from cache and decodes in
 * the same frame as the first open.
 */
export const MIN_PROGRESSIVE_THUMB_VISIBLE_MS = 160;

// ── Viewport pan clamp (`useImageTransform`, axis-aligned overlap model) ─────

/** Main image drag: min fraction of viewport **width** and **height** that must show image. */
export const MAIN_DRAG_MIN_VIEWPORT_COVERAGE = 0.5;

/**
 * Minimap viewport drag: max fraction of viewport **width** and **height** that may show frosted
 * background (each axis in the same model). `0.1` → at least 90% coverage when the image allows.
 */
export const MINIMAP_PAN_MAX_VIEWPORT_BACKGROUND_FRACTION = 0.1;

/** Min coverage for minimap-driven `panByDelta`; derived from the background cap above. */
export const MINIMAP_PAN_MIN_VIEWPORT_COVERAGE =
  1 - MINIMAP_PAN_MAX_VIEWPORT_BACKGROUND_FRACTION;

/** Toolbar / wheel zoom translate correction: same as main-image drag. */
export const ZOOM_CLAMP_MIN_VIEWPORT_COVERAGE = MAIN_DRAG_MIN_VIEWPORT_COVERAGE;

// ── Wheel zoom (`ImagePreview` overlay) ──────────────────────────────────────

/**
 * Accumulated pixel-mode `deltaY` before advancing **one** zoom stop (smooth trackpads).
 * Many mice report **small** `|deltaY|` per detent (e.g. 2–8); keep this low so 1–2 notches
 * cross the threshold. Fast flicks use the notch band or large-delta accumulation instead.
 */
export const WHEEL_ACCUM_PIXELS_PER_STOP = 3;

/**
 * When `deltaMode === DOM_DELTA_PIXEL`, `|deltaY|` in this band ⇒ **one** zoom stop per event
 * (typical “one big notch” reporting, ~40–120px).
 */
export const WHEEL_PIXEL_MOUSE_NOTCH_MIN = 16;
export const WHEEL_PIXEL_MOUSE_NOTCH_MAX = 220;

/**
 * Mice that report **small** pixel deltas per detent: if `|deltaY|` is in
 * `[COALESCE_MIN_DELTA, NOTCH_MIN)` and the previous wheel event was at least **GAP_MS** ago,
 * treat this event as **one physical detent** → one stop (slow click‑by‑click scrolling).
 * Ignores ultra‑tiny deltas so smooth trackpads don’t get one‑stop‑per‑pixel when events are sparse.
 */
export const WHEEL_PIXEL_COALESCE_GAP_MS = 90;
export const WHEEL_PIXEL_COALESCE_MIN_DELTA = 2;

/** Scale `deltaY` when `deltaMode === DOM_DELTA_PAGE` (rare). */
export const WHEEL_PAGE_DELTA_SCALE = 600;

/**
 * Max discrete stops applied per drain pass (one sync handler + one rAF continuation).
 * Avoids blocking the main thread on huge bursts.
 */
export const WHEEL_MAX_STEPS_PER_DRAIN = 10;

// ── Toolbar zoom label (`Toolbar` / `ZoomInput`) ───────────────────────────────

/** Fixed width (px) of the zoom % slot — fits `800%` + padding (tabular digits). */
export const TOOLBAR_ZOOM_LABEL_SLOT_PX_EN = 56;

/** Same as EN: numeric labels use Western digits in zh UI too. */
export const TOOLBAR_ZOOM_LABEL_SLOT_PX_ZH = 56;

/** Resolve slot width from BCP 47 tag (same primary-subtag rule as `resolveStrings`). */
export function toolbarZoomLabelSlotPx(language?: string): number {
  const primary = language?.split(/[-_]/)[0].toLowerCase();
  return primary === 'zh' ? TOOLBAR_ZOOM_LABEL_SLOT_PX_ZH : TOOLBAR_ZOOM_LABEL_SLOT_PX_EN;
}

/** Fixed width (px) of the zoom preset dropdown — wider than the narrow % trigger. */
export const ZOOM_DROPDOWN_WIDTH_PX_EN = 110;

/** Chinese “适应 (约 n%)” row needs a bit more horizontal room. */
export const ZOOM_DROPDOWN_WIDTH_PX_ZH = 136;

export function toolbarZoomDropdownWidthPx(language?: string): number {
  const primary = language?.split(/[-_]/)[0].toLowerCase();
  return primary === 'zh' ? ZOOM_DROPDOWN_WIDTH_PX_ZH : ZOOM_DROPDOWN_WIDTH_PX_EN;
}

/** Zoom dropdown: max width when viewport is narrow (rows use ellipsis). ≥ zh dropdown width. */
export const ZOOM_DROPDOWN_MAX_WIDTH_PX = 160;

/** Min width for the `current / total` counter between prev/next (tabular digits). */
export const TOOLBAR_NAV_COUNTER_MIN_WIDTH_PX = 52;

// ── Minimap pointer ↔ pan Jacobian (`minimapMath`) ───────────────────────────

/** Step (container px) for ∂m/∂tx, ∂m/∂ty finite differences. */
export const MINIMAP_JACOBIAN_EPS = 0.25;
