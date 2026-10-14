# Changelog

## [Unreleased]

### Fixed

- Upgrade `@easy_vscode/webview` to 2.0.2 so HTTP(S) WebViews, including code-server, initialize host messaging instead of leaving the gallery stuck at “Scanning…”. Preserve the existing host command, resource and CSP restrictions.

### Security

- Restrict WebView commands, scripts, feedback links and file access; validate configuration writes and bind each gallery to its host-resolved workspace root.

### Added

- Reuse one project-root gallery for Explorer entries and prioritize the requested subtree during scanning, with explicit navigation and temporary view filters.

- **Adaptive preview zoom:** Space and a primary-mouse click share a two/three-state cycle, with pointer/viewport-center anchoring, click-versus-pan arbitration, and short zoom hints.
- **Scrollbar folder indication:** viewport folder HUD and temporary tree reveal/highlight while dragging; landing highlights persist without changing selection or saved expansion.

- **Extended zoom presets:** 250%, 300%, 400%, 600%, and 800% in the gallery preview and direct image editor.

- **Folder scan rules:** project-relative directory paths and Glob expressions, with validation and shared host/Mock matching. Includes and exclusions compose with scoped folder entries.
- **Settings and feedback:** separate folder scan filters from settings; add Gallery and Feedback tabs, with file-size display preferences and GitHub issue/email entry points.
- **Folders sidebar:** virtualized directory tree with image counts, folder search, expandable branches, context menus, sidebar visibility, and adjustable width.
- **Gallery layouts:** continuous Fill, Grid, and List views with compact mode, adjustable density, and scroll position preservation across layouts.
- **Browser development preview:** explicit Mock mode with generated data for testing large collections without launching VS Code.

- **Single-image editor:** open image files directly in a read-only, full-screen preview with zoom, pan, rotation, flip, keyboard controls, and a navigation minimap.
- **Same-folder navigation:** use the toolbar or side arrows to browse sibling images in Explorer sort order, including its filename comparison and reverse-order settings. Images outside the workspace are also supported.
- **Optional default editor:** use **Image Viewer: Use as Default Image Editor** to set supported image associations, or **Image Viewer: Restore VS Code's Default Image Editor** to remove associations that still point to Image Viewer. Installation and updates do not change the default automatically.
- **Manual gallery cache cleanup:** run **Image Viewer: Clean Gallery WebView Image Cache** to clear the gallery's accessible WebView image resource caches.

### Changed

- Rename the gallery sidebar to **Image folders**. Image menus now offer **Reveal in Image folders**, which shows, selects, and centers the containing directory, temporarily clears image search, and centers/highlights the original image so neighboring images can be browsed. Saved search, type filters, and Include subfolders preferences are preserved.

- During scrollbar tracking, expand only the current viewport's folder ancestors and collapse offscreen branches, temporarily overriding saved/search expansion without persisting it.
- Default to natural folder order with configurable name, modified-time, size, or format sorting inside each folder. Offer global sorting separately; disable folder HUD/tree tracking in global mode. Sorting changes reuse the scan snapshot.
- Center viewport folder highlights as a group in the tree, with a uniform subtle background and no overlapping accent bar.

- Follow now uses a distinct editor/display icon; sun and moon icons identify manual Light and Dark modes.
- Thumbnail sizing now grows from left to right, displays actual CSS pixel sizes, and limits Fill/Grid to 1–20 columns.
- Remove duplicate Appearance settings; put the frameless No background option before checkerboard, with a circle-slash icon.

- Manual Light/Dark now use VS Code Light 2026 / Dark 2026 color snapshots; Follow inherits the current host theme and color customizations through the same palette mapping. Theme detection reads body metadata and observes color changes within the same light/dark kind.

- Integrate include/exclude fields beside Find folder using an expandable Search-style area; apply drafts explicitly and retain active filters when collapsed.
- Move theme controls to the bottom-right, place Include subfolders in the Folders menu, remove the redundant scope row, and distinguish community links from gallery filters.
- Replace accordion folder groups with one virtualized image wall. Folder-first and global sorting both apply to the complete filtered result; preview navigation follows that result.
- Scan image folders asynchronously and cancel superseded scans. Thumbnail generation is deduplicated and limited to two concurrent jobs; the wall prioritizes visible requests and bounds unused URL results.
- Check the thumbnail disk cache on startup and periodically, evict older entries when size/file-count budgets are exceeded, and invalidate cached paths after deletion.
- Image deletion from the gallery now moves supported files to system Trash after confirmation, without falling back to permanent deletion.

- Direct image opening now uses a dedicated viewer entry without loading the gallery interface. It lists only images in the immediate folder, without scanning subfolders or generating thumbnails.
- Gallery and single-image resource caches are cleaned in the background on first use and pruned during viewing to retain actively used images plus a short navigation grace period.
- Historical cache cleanup starts after the initial render and a browser idle window; old cache generations are deleted sequentially to reduce startup disk I/O contention.

### Fixed

- Map logical gallery height into bounded browser scroll space so very large one-column collections can reach their final images.

- Match selected-image paths consistently across Windows slash styles.

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
