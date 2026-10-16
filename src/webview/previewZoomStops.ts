/** Shared by the gallery preview and direct editor. Higher stops follow Media Lens. */
export const PREVIEW_ZOOM_STOPS = [10, 25, 50, 75, 100, 150, 200, 250, 300, 400, 600, 800]

/** The only additional preset for originals whose longest edge is at most 64px. */
export const PREVIEW_SMALL_IMAGE_ZOOM = { maxEdge: 64, maxNativePercent: 1600 }
