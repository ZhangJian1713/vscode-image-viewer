# Changelog

## [1.6.2] - 2024-04-28

### Fixed

- Image not reloading upon clicking the refresh button when content changes but filename remains unchanged.
- Failure to detect images with uppercase extensions.

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
