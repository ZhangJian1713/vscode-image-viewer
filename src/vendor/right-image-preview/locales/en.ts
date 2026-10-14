import type { LocaleStrings } from '../localeTypes';

export const enStrings: LocaleStrings = {
  fit: 'Fit',
  fitApprox: (pct) => `Fit (${pct}%)`,

  fitToViewport: 'Fit to viewport',
  actualSize: 'Actual size (100%)',
  zoomIn: 'Zoom in',
  zoomOut: 'Zoom out',
  lockZoom: 'Lock zoom (preserve zoom when switching images)',
  unlockZoom: 'Unlock zoom (preserve zoom when switching images)',
  rotateCW: 'Rotate 90° clockwise',
  rotateCCW: 'Rotate 90° counter-clockwise',
  flipH: 'Flip horizontal',
  flipV: 'Flip vertical',

  prev: 'Previous',
  next: 'Next',
  prevGroup: 'Previous group',
  nextGroup: 'Next group',

  imagePreview: 'Image preview',
  toolbar: 'Image preview toolbar',
  close: 'Close (Esc)',
  loadingImage: 'Loading image',
  minimapNav: 'Navigation minimap',

  tipFitToViewport:
    'Show the whole picture in the window. The image may look smaller so nothing is cropped.',
  tipActualSize:
    'View at real pixel size (100%). The picture may be larger than the window — drag to pan.',
  tipZoomIn: 'Zoom in — the picture looks larger; you see a smaller area in more detail.',
  tipZoomOut: 'Zoom out — see more of the picture at once.',
  tipLockZoom:
    'Lock zoom: when you switch to another image, keep the same zoom and position if possible.',
  tipUnlockZoom:
    'Unlock zoom: when you switch images, the view resets to fit the new picture in the window.',
  tipRotateCW: 'Rotate the picture a quarter turn clockwise.',
  tipRotateCCW: 'Rotate the picture a quarter turn counter-clockwise.',
  tipFlipH: 'Mirror the picture left and right.',
  tipFlipV: 'Mirror the picture top and bottom.',
  tipPrev: 'Go to the previous image.',
  tipNext: 'Go to the next image.',
  tipPrevGroup: 'Jump to the previous album or group of images.',
  tipNextGroup: 'Jump to the next album or group of images.',
  tipClose: 'Close the preview. You can also press the Esc key.',
  tipZoomLevel:
    'Click to type a zoom percentage, or open the list of quick zoom sizes and “fit whole image”.',
  tipZoomRowPercent: (pct) =>
    `Set zoom to about ${pct}% of the original image size.`,
  tipZoomRowFit: 'Fit the entire image inside the window.',
  tipZoomRowFitApprox: (pct) =>
    `Fit the whole image in the window — here that is about ${pct}% of real size.`,
  tipMinimap:
    'Mini map of the image. Drag the highlighted frame to move the view; click outside the frame to center that spot.',
};
