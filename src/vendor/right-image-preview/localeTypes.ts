/**
 * All user-visible strings in the ImagePreview component.
 * Per-language objects live in `locales/*.ts`.
 */
export interface LocaleStrings {
    /** Zoom dropdown fallback when fit-equivalent % is not yet known. */
    fit: string;
    /** Zoom dropdown row for Fit mode — includes estimated native %. */
    fitApprox(pct: number): string;
    fitToViewport: string;
    actualSize: string;
    zoomIn: string;
    zoomOut: string;
    lockZoom: string;
    unlockZoom: string;
    rotateCW: string;
    rotateCCW: string;
    flipH: string;
    flipV: string;
    prev: string;
    next: string;
    prevGroup: string;
    nextGroup: string;
    imagePreview: string;
    toolbar: string;
    close: string;
    loadingImage: string;
    /** Minimap landmark (aria). */
    minimapNav: string;
    tipFitToViewport: string;
    tipActualSize: string;
    tipZoomIn: string;
    tipZoomOut: string;
    tipLockZoom: string;
    tipUnlockZoom: string;
    tipRotateCW: string;
    tipRotateCCW: string;
    tipFlipH: string;
    tipFlipV: string;
    tipPrev: string;
    tipNext: string;
    tipPrevGroup: string;
    tipNextGroup: string;
    tipClose: string;
    /** Zoom % control: type value or open preset list. */
    tipZoomLevel: string;
    tipZoomRowPercent(pct: number): string;
    tipZoomRowFit: string;
    tipZoomRowFitApprox(pct: number): string;
    tipMinimap: string;
}
