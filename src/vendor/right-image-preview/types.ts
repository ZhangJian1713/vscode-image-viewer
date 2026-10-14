import { default as React } from 'react';
export type ZoomMode = 'fit' | 'native';
/** Native zoom percentage: 100 means 1 CSS pixel = 1 image pixel. */
export type NativePercent = number;
export interface ZoomState {
    mode: ZoomMode;
    /** Only meaningful when mode === 'native'. */
    nativePercent: NativePercent;
    /** Approximate native% equivalent of the current fit scale. Available once image is loaded. */
    fitEquivalentNativePercent?: number;
}
export interface ImageItem {
    /**
     * Stable unique key for the item (e.g. file path). Prefer this over {@link name} for identity:
     * names can repeat or change when renamed.
     */
    id?: string;
    src: string;
    alt?: string;
    /** Filename displayed in the info bar above the toolbar. */
    name?: string;
    /**
     * Optional URL for the navigation minimap (e.g. external pre-generated thumbnail).
     * Defaults to {@link src}. Ignored when {@link minimap} is set.
     */
    minimapSrc?: string;
    /**
     * Optional custom minimap content (e.g. `<img />`). When set, replaces the default minimap image;
     * layout still follows the main image’s natural aspect ratio, rotation, and flips. Overrides {@link minimapSrc}.
     */
    minimap?: React.ReactNode;
}
/**
 * A named album/folder segment: its {@link images} are concatenated in order to form the flat list.
 * Prefer this over maintaining manual index ranges.
 */
export interface ImageGroup {
    /** Optional stable id (e.g. directory path). */
    id?: string;
    /** Display name shown in the toolbar (folder / album label). */
    name: string;
    images: ImageItem[];
}
/**
 * Strategy when zooming in from Fit mode.
 * - 'above-fit': snap to the smallest stop strictly greater than the fit-equivalent native%.
 * - 'first-stop': always start from the first (smallest) stop.
 * - 'hundred': always start from 100%.
 */
export type FirstZoomInStrategy = 'above-fit' | 'first-stop' | 'hundred';
/**
 * Behaviour when zooming out below the minimum stop.
 * - 'fit': switch back to Fit mode.
 * - 'noop': do nothing.
 */
export type ZoomOutBelowMinBehaviour = 'fit' | 'noop';
/**
 * Behaviour when zooming in at the maximum stop.
 * - 'noop': do nothing.
 * - 'notify': call onMaxStopReached.
 */
export type ZoomInAtMaxBehaviour = 'noop' | 'notify';
/** Strategy for mouse-wheel zooming. */
export type WheelStrategy = 
/** Each wheel tick moves ±1 stop. */
'stop-by-stop'
/** Continuous scaling that snaps to the nearest stop on wheel end. */
 | 'snap';
/**
 * Controls **side-of-image** navigation arrows only (left/right of the picture).
 *
 * - `'both'`    — side arrows **and** toolbar prev/next (default).
 * - `'side'`    — side arrows only; toolbar still has prev/next on flat lists (counter sits between them).
 * - `'toolbar'` — toolbar prev/next only; no side arrows.
 * - `'none'`    — no side arrows; keyboard ← → still works.
 *
 * When {@link ImagePreviewProps.groupedImages} is non-empty (**folder / multi-group mode**), toolbar prev/next are **always** shown;
 * this prop no longer hides them — only the side arrows obey the table above.
 */
export type ArrowsConfig = 'both' | 'side' | 'toolbar' | 'none';
/**
 * Stages for the optional progressive main-image pipeline (`minimapSrc` thumbnail
 * underlay until the full `src` has loaded in the DOM). Used by {@link ImagePreviewProps.onMainImageLoadStageChange}.
 */
export type MainImageLoadStage = 'inactive' | 'preloading' | 'thumbnail-placeholder'
/** Full `src` failed to load/decode, but `minimapSrc` succeeded — main area shows thumbnail only. */
 | 'thumb-only' | 'full-ready' | 'error';
/**
 * Initial picture when using {@link ImagePreviewProps.groupedImages}.
 * `defaultGroupIndex` is the index among groups that have `images.length > 0` only, in array order (skipped empty groups are not counted).
 */
export interface DefaultGroupedSelection {
    defaultGroupIndex: number;
    /** 0-based index within that group's `images` array. */
    defaultIndexInGroup: number;
}
export interface ImagePreviewProps {
    /** Single image shorthand. Ignored when `images` or non-empty `groupedImages` is provided. */
    src?: string;
    alt?: string;
    /**
     * Single-image minimap URL (only when using `src`, not `images`). Same as {@link ImageItem.minimapSrc}.
     */
    minimapSrc?: string;
    /**
     * Single-image custom minimap node (only when using `src`). Same as {@link ImageItem.minimap}.
     */
    minimap?: React.ReactNode;
    /**
     * Flat list of images. Ignored when `src` is not used if {@link groupedImages} is non-empty.
     * Ignored when `groupedImages` is provided (see priority there).
     */
    images?: ImageItem[];
    /**
     * Folder-style input: each entry’s `images` are concatenated in order. Left/right arrows stay within
     * the current group; toolbar shows prev/next-group when there are multiple groups.
     * When set (non-empty), it takes precedence over {@link images}.
     */
    groupedImages?: ImageGroup[];
    /** Controlled visibility. */
    visible?: boolean;
    /**
     * Initial image when using non-empty {@link groupedImages}: which group and which item inside that group.
     * Takes precedence over {@link defaultIndex} in that mode.
     */
    defaultGroupedSelection?: DefaultGroupedSelection;
    /**
     * Initial visible index in the **flattened** list (single `src`, flat `images`, or derived from `groupedImages`).
     * When {@link defaultGroupedSelection} is set and groups exist, this prop is ignored.
     */
    defaultIndex?: number;
    /**
     * Discrete native-percent zoom stops.
     * Must be sorted ascending and contain at least one value.
     * Default: [10, 25, 50, 75, 100, 150, 200] (max 200 % — higher ratios are usually too soft for preview).
     */
    stops?: NativePercent[];
    /** Initial zoom mode. Default: 'fit'. */
    initialMode?: ZoomMode;
    /** Initial native% when initialMode === 'native'. Default: first stop. */
    initialNativePercent?: NativePercent;
    firstZoomInStrategy?: FirstZoomInStrategy;
    zoomOutBelowMinBehaviour?: ZoomOutBelowMinBehaviour;
    zoomInAtMaxBehaviour?: ZoomInAtMaxBehaviour;
    /** Enable mouse-wheel zoom. Default: true. */
    wheelEnabled?: boolean;
    wheelStrategy?: WheelStrategy;
    /** Enable double-click to toggle fit ↔ 100%. Default: true. */
    doubleClickEnabled?: boolean;
    /** Adaptive Space / primary-mouse cycle, with click/pan arbitration. */
    clickZoomEnabled?: boolean;
    /**
     * Reset zoom state when switching images.
     * Default: true.
     */
    switchImageResetZoom?: boolean;
    /**
     * Reset rotation and flip when switching images.
     * Default: true.
     */
    switchImageResetTransform?: boolean;
    /**
     * Reset pan (translate) when calling fit().
     * Default: true.
     */
    fitResetPan?: boolean;
    /**
     * Show the horizontal/vertical flip buttons in the toolbar.
     * Default: false (flip is available but hidden by default to keep the toolbar compact).
     */
    showFlip?: boolean;
    /**
     * Which **side** arrow buttons to render. Toolbar prev/next in multi-group mode (`groupedImages`) are always on.
     * Default: `'both'`. See `ArrowsConfig`.
     */
    arrows?: ArrowsConfig;
    /**
     * Initial zoom-lock state. When true, switching images preserves the current zoom
     * mode and percentage instead of resetting to fit.
     * The user can toggle this in the toolbar via the lock icon.
     * Default: false.
     */
    initialZoomLocked?: boolean;
    /**
     * When true (default), show a bottom-right navigation minimap whenever the image
     * overflows the viewport in Native zoom mode. The dashed frame tracks pan/zoom/rotate;
     * dragging inside the frame pans the main image.
     */
    showMinimap?: boolean;
    /**
     * When true (default) and the current item has {@link ImageItem.minimapSrc} and no custom
     * {@link ImageItem.minimap}, the main view uses that URL as a stretched placeholder after the
     * full image dimensions are known (background preload), keeps the centre loading spinner until
     * the full `src` has loaded and decoded in the DOM, then reveals the sharp image without
     * changing the corner minimap.
     */
    progressiveMain?: boolean;
    /**
     * Opacity crossfade duration (ms) when revealing the full main image over the thumbnail
     * placeholder. `0` (default) switches instantly to avoid any double-exposure flash.
     */
    progressiveFadeMs?: number;
    /** Optional hook for tests, analytics, or debugging the progressive pipeline. */
    onMainImageLoadStageChange?: (stage: MainImageLoadStage) => void;
    /**
     * Custom counter renderer, similar to Ant Design's countRender.
     * Receives (currentIndex + 1, total). Return any React node to replace
     * the default "n / total" counter in the toolbar.
     * @deprecated Prefer using {@link groupedImages} for multi-folder scenarios.
     */
    countRender?: (current: number, total: number) => React.ReactNode;
    /**
     * Whether clicking the dark overlay backdrop (outside the image, toolbar, and info badge)
     * closes the preview, just like pressing Esc or the close button.
     * Default: `false`.
     */
    closeOnMaskClick?: boolean;
    /**
     * Extra CSS class applied to the overlay backdrop element.
     * Use this to override the background, blur, or any other visual property.
     */
    overlayClassName?: string;
    /**
     * Inline style overrides merged onto the overlay backdrop element.
     * Merged after the default styles, so any property you provide takes precedence.
     * Example: `{ background: 'rgba(0,0,0,0.95)' }` to get a fully opaque black backdrop.
     */
    overlayStyle?: React.CSSProperties;
    /**
     * Preferred display language for all user-visible text (button labels,
     * aria-labels, zoom display, etc.).
     *
     * Accepts any BCP 47 language tag such as `"en"`, `"en-US"`, `"zh"`, or
     * `"zh-CN"` or `"zh-TW"`. Chinese script/region tags select Simplified or Traditional; unrecognised
     * locales fall back to English.
     *
     * Currently built-in: `"en"` (default), `"zh"` / `"zh-CN"`, and `"zh-TW"` / `"zh-Hant"`.
     *
     * Default: `"en"`.
     */
    language?: string;
    onClose?: () => void;
    onZoomChange?: (state: ZoomState) => void;
    /** Active image changed; `index` is always the flattened list position (including when using `groupedImages`). */
    onIndexChange?: (index: number) => void;
    /** Called when attempting to zoom in at the maximum stop (only when zoomInAtMaxBehaviour === 'notify'). */
    onMaxStopReached?: () => void;
}
export interface ImagePreviewRef {
    zoomIn(): void;
    zoomOut(): void;
    /** Switch to Fit mode. */
    fit(): void;
    /** Switch to Native mode at the given percentage. */
    setNative(percent: NativePercent): void;
    /** Rotate image 90° clockwise. */
    rotateCW(): void;
    /** Rotate image 90° counter-clockwise. */
    rotateCCW(): void;
    /** Flip image horizontally (left ↔ right). */
    flipHorizontal(): void;
    /** Flip image vertically (top ↔ bottom). */
    flipVertical(): void;
    /** Navigate to the next image within the current group (or globally if not grouped). */
    next(): void;
    /** Navigate to the previous image within the current group (or globally if not grouped). */
    prev(): void;
    /** Navigate to the first image of the next group (requires `groupedImages`). */
    nextGroup(): void;
    /** Navigate to the first image of the previous group (requires `groupedImages`). */
    prevGroup(): void;
    getState(): ZoomState;
}
