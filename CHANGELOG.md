# Changelog

## [Unreleased]

### Added

- Added an optional, read-only custom editor for opening individual image files directly in the full-screen viewer.
- Added **Image Viewer: Use as Default Image Editor** and **Image Viewer: Restore VS Code's Default Image Editor** commands for the supported image formats.
- Added a dedicated single-image viewer mode that opens without scanning or briefly rendering the image-library view.

### Changed

- The restore command removes only supported-format associations that still point to Image Viewer and preserves unrelated editor associations.
- Normalized selected-image path matching across slash styles on Windows.

## [2.0.5] - 2026-04-17

### Added

- Added tooltip hints for preview toolbar buttons to make controls easier to understand.

### Changed

- Upgraded `right-image-preview` to the latest API model and aligned grouped preview integration.

## [2.0.4] - 2026-04-17

### Changed

- Republish this release to keep VS Code Marketplace and Open VSX versions aligned.

## [2.0.3] - 2026-04-17

### Changed

- Minor follow-up polish and republish for Marketplace sync.

## [2.0.2] - 2026-04-17

### Added

- **New preview experience:** the large-image viewer is now based on our self-maintained `right-image-preview`.
- **Smoother browsing:** next/previous navigation follows the folder order shown in the panel, so switching images feels more natural.
- **Clearer preview map:** the small overview map is sharper and more efficient for large images.
- **Better controls:** preview now has more convenient zoom and navigation interactions, plus quick flip actions.


## [2.0.0] - 2026-04-09

### Added

- **UI themes:** switch light / dark for the Image Viewer panel; default follows VS Code or Cursor.
- **Grid layout:** control thumbnail density with **Columns** (replaces the old Size-centric layout for better use of panel width).
- **Sorting:** multiple ways to sort images **within each folder** (name, modified time, size; ascending / descending).
- **Preview backdrops:** checkerboard and **transparent** (default) background options, plus solid color swatches.
- **Preview:** large-image preview shows the **file name**.
- **Release notes:** in-panel **“What’s new”** for this version (dismissible; text matches this changelog / announcement).
- **Explorer workflow:** right-click a **folder** or file to open Image Viewer — **only that directory tree** is scanned (improves performance in very large projects).
- **Multiple panels:** different folders can each get their own Image Viewer **editor tab**; tab **title** includes the scoped folder name.
- **Robustness:** ignore macOS **`._*`** sidecar files on volumes such as exFAT; treat image extensions **case-insensitively** (e.g. `.JPG`).

### Changed

- **Runtime:** extension target **VS Code 1.75+**; activation is inferred from `contributes` (no broad `activationEvents: ["*"]`).
- **Web stack:** Ant Design 5–based webview shell and styling refresh.
- **Thumbnail pipeline:** faster grid thumbnails on macOS (e.g. `sips`) with tiered decode sizes; ongoing lazy-load / I/O budget tuning for huge grids.

## [1.6.0] - 2023-12-18

### Added

- Individual project settings are now stored in local files.
- Search now has options to include or exclude specific folders.

## [1.5.3] - 2023-06-03

### Added

- Added support for avif format

## [1.4.1] - 2023-03-07

### Added

- Only show clicked image or directory

## [1.4.0] - 2023-03-06

### Added

- Show file size and image width and height while preview

### Fixed

- Lazy loading was missing from a previous release, but it has now been added back
- Debounce was added to improve performance when scrolling

## [1.3.3] - 2022-12-23

### Fixed

- Fixed page rendering failure, that is because the old static resource file protocol is no longer supported and has been updated to a new file protocol.

## [1.3.0] - 2022-8-24

### Added

- Updated logo

## [1.2.0] - 2022-8-19

### Added

- I18n: Automatically set language to be the same as VSCode

## [1.1.0] - 2022-7-24

### Updated

- Optimized performance when there are many images (Tested with 10,000 images, switch to lazy loading when the images exceeds 100)

## [1.0.6] - 2022-7-7

### Updated

- Add `Expand All` and `Collapse All` Buttons to quickly toggle visibility of directories.
- Anytime there are more than 120 images(after being filtered) being displayed, all directories are collapsed by default.

### Fixed

- Output error to console.

## [1.0.0] - 2022-6-28

### Added

- init
