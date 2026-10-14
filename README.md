# Image Viewer

**English** | [中文](./README.zh-CN.md)

**Use Image Viewer as your default image viewer in VS Code.** Get zoom presets up to **800%**, click/Space zoom cycling, rotation and flipping, a navigation minimap, and same-folder image navigation. [Make it the default](#make-it-the-default).

Browse project assets in **VS Code and Cursor** with a continuous image wall, folders, search, and filters.

Click any screenshot to view it at full size.

## Video demo

Watch the image wall and folder navigation in action.

<video src="https://raw.githubusercontent.com/ZhangJian1713/vscode-image-viewer/main/assets/demos/gallery-demo.mp4" poster="https://public-img-1253867148.cos.ap-singapore.myqcloud.com/img-in-docs/vscode-image-viewer/gallery-demo-poster.webp" width="800" style="max-width:100%;height:auto;" controls preload="none"></video>

[Watch or download the video](https://raw.githubusercontent.com/ZhangJian1713/vscode-image-viewer/main/assets/demos/gallery-demo.mp4).

## Quick start

| To… | Do this |
| --- | --- |
| Open an image | Right-click an image in Explorer → **Open With...** / **Reopen Editor With...** → **Image Viewer** |
| Use Image Viewer by default | Open the Command Palette (`Ctrl+Shift+P` / `⌘⇧P`) → **Image Viewer: Use as Default Image Editor** |
| Browse the workspace | Open a folder or workspace → run **View Images 🌄** from the Command Palette |
| Browse a specific folder | Right-click the folder in Explorer → **View Images 🌄**; opens the project gallery at that folder |

## Single-image viewer

Zoom into details, pan with the minimap, and browse nearby images without changing the original files.

[![Single-image viewer with zoom, rotation, flip, and navigation minimap](https://public-img-1253867148.cos.ap-singapore.myqcloud.com/img-in-docs/vscode-image-viewer/single-image-editor-blue-marble.webp)](https://public-img-1253867148.cos.ap-singapore.myqcloud.com/img-in-docs/vscode-image-viewer/single-image-editor-blue-marble.webp)

- **Zoom and pan:** use the mouse wheel, toolbar, or enter a percentage. Press **Space** or click the image to cycle through two or three zoom levels suited to its size. Zoom presets extend to **800%**.
- **Inspect details:** drag an enlarged image or navigate with the minimap.
- **Rotate and flip:** rotate in either direction, or flip horizontally and vertically, without changing the original file.
- **Navigate:** browse other images in the same folder with toolbar buttons, side arrows, or keyboard controls. The order follows Explorer's sorting settings.
- **Unobstructed viewing:** controls fade when idle. Images outside the workspace can also be opened.

### Make it the default

Run **Image Viewer: Use as Default Image Editor** to open supported image files with this viewer by default. Installing or updating the extension leaves your editor choice unchanged.

[![Use as Default Image Editor in the VS Code Command Palette](https://public-img-1253867148.cos.ap-singapore.myqcloud.com/img-in-docs/vscode-image-viewer/set-default-image-editor-command.webp)](https://public-img-1253867148.cos.ap-singapore.myqcloud.com/img-in-docs/vscode-image-viewer/set-default-image-editor-command.webp)

To remove these associations, run **Image Viewer: Restore VS Code's Default Image Editor** before uninstalling. This does not restore earlier custom associations overwritten by setup. [More about editor associations](./docs/usage-notes.md#default-editor-associations).

## Workspace gallery

New galleries start in Grid. Select a folder in the sidebar and browse one continuous image wall. Click any thumbnail to open the large-image preview. Grid and Fill support **1–20 columns**, live thumbnail sizing, and a compact mode for denser browsing.

### Grid — see the whole image (default)

Images keep their original proportions without cropping, useful for comparing portraits, landscapes, and panoramic images.

[![Grid layout showing complete images](https://public-img-1253867148.cos.ap-singapore.myqcloud.com/img-in-docs/vscode-image-viewer/gallery-grid-photos.webp)](https://public-img-1253867148.cos.ap-singapore.myqcloud.com/img-in-docs/vscode-image-viewer/gallery-grid-photos.webp)

### Fill — browse thumbnails

Square thumbnails fill the wall, making it easy to scan many images at once.

[![Fill layout: folders sidebar and continuous image wall](https://public-img-1253867148.cos.ap-singapore.myqcloud.com/img-in-docs/vscode-image-viewer/gallery-fill-photos.webp)](https://public-img-1253867148.cos.ap-singapore.myqcloud.com/img-in-docs/vscode-image-viewer/gallery-fill-photos.webp)

### Compact and thumbnail size

Turn on **Compact** in the bottom toolbar. In Grid/Fill, it removes thumbnail gaps and the always-visible file names and sizes; hover to see a file name. **Fill + Compact** creates a seamless image wall, fitting more images on screen at the same column count.

Drag the **Thumbnails** slider to adjust **1–20 columns**: right makes images larger with fewer columns; left fits more, smaller thumbnails. The tooltip shows the current pixel size and column count. Below, the six-column Fill example is changed to **four columns + Compact**.

[![Fill + Compact with four columns and 260 px thumbnails](https://public-img-1253867148.cos.ap-singapore.myqcloud.com/img-in-docs/vscode-image-viewer/gallery-fill-compact-photos.webp)](https://public-img-1253867148.cos.ap-singapore.myqcloud.com/img-in-docs/vscode-image-viewer/gallery-fill-compact-photos.webp)

### List — inspect file information

View the file name, relative path, size, dimensions, and modified time alongside each thumbnail.

[![List layout with paths, sizes, dimensions, and modified times](https://public-img-1253867148.cos.ap-singapore.myqcloud.com/img-in-docs/vscode-image-viewer/gallery-list-photos.webp)](https://public-img-1253867148.cos.ap-singapore.myqcloud.com/img-in-docs/vscode-image-viewer/gallery-list-photos.webp)

Screenshot [credits and licenses](./assets/screenshots/CREDITS.md).

### Themes

Click the theme button beside the bottom-right gear to cycle between **Follow**, **Light**, and **Dark**.

- **Follow** (display icon): inherits your current VS Code/Cursor theme and color customizations, including your chosen custom theme, keeping the viewer's appearance consistent with the host editor.
- **Light** (sun) and **Dark** (moon): use fixed palettes based on VS Code's default light/dark themes, independently of the editor's current theme.

Choose a thumbnail background separately: none, checkerboard for transparency, or a solid color.

### Open from Explorer

Right-click a folder or file → **View Images 🌄**. The sidebar shows the project root and reveals your target. Images are highlighted in the wall and opened in the large-image preview; other files locate their containing folder. Empty folders fall back to the nearest ancestor with images, then the project root. Closing the preview returns to the located thumbnail.

Explorer entries in the same project reuse one gallery tab; different workspace roots have separate tabs. Use **Refresh images** after external file changes. If search/type filters hide the target, they are temporarily adjusted, with **Restore filters** available.

### Find and organize images

- **Image folders:** browse image-containing directories and their ancestors, see image counts, and expand or collapse branches. Hide or resize the sidebar.
- **Return from search to a folder:** right-click an image → **Reveal in Image folders**. The gallery selects and centers its containing folder, temporarily clears image search, and highlights the original image among its neighbors. Use **Restore filters** to recover the search; Types and Include subfolders remain in effect.
- **Sorting:** keep each folder's images together, or sort the whole collection by name, modified time, size, or format. In folder-first mode, dragging the scrollbar highlights the visible folders in the tree.
- **File actions:** reveal files, copy paths, names, or Base64, and move images to Trash after confirmation. Right-click folders to reveal, copy paths, or exclude them.
- **Settings and feedback:** use the bottom-right gear for settings, bug reports, and feature requests.
- **Language:** Settings → General → Language offers Follow VS Code, English, 简体中文, and 繁體中文. Unsupported editor languages default to English. Switching updates open panels while preserving your browsing state.

### Folder search and Include/Exclude

Type part of a folder name into **Find folder** in the left sidebar. Matching is case-insensitive; matching folders and their ancestors remain visible, with the tree expanded to reveal them. Click a result to show its images. Clear the search to restore the full tree.

Expand the filter button beside **Find folder** to set **folders to include** and **folders to exclude**. Include limits the gallery to selected folder trees; Exclude skips unwanted folders, such as build output. Folder search works within these rules, and can also be combined with the image name/path search and **Types** filter above the wall.

Use project-relative folder paths or **Glob patterns** (wildcard expressions). Enter one rule per line; press Enter or **Apply** to use the rules, and Shift+Enter to add a line.

| Rule | Selects |
| --- | --- |
| `assets` | assets and all its subfolders |
| `assets/{photos,icons}/**` | both folder trees |
| `assets/set-*` | matching set folders and their subfolders |
| `**/{dist,build}` | dist/build folders at any depth and their subfolders |

Glob supports `*`, `**`, `?`, character sets such as `[ab]`, and alternatives such as `{photos,icons}`. Rules target **folders**, and a matching folder includes its descendants. Exclude takes priority over Include. Leave Include empty to browse all project folders; collapsing the fields keeps applied rules active.

Use **Image folders → Include subfolders** to choose whether the wall shows the selected folder's descendants. This is independent of Include/Exclude scan rules.

## Performance and requirements

| Item | Details |
| --- | --- |
| Zoom presets | Up to **800%** |
| Image wall density | **1–20 columns** in Grid/Fill |
| Large-collection validation | **100,000 images and about 10,000 directory nodes**, using simulated data |
| Gallery browsing | Load thumbnails at the current position first, without generating the entire collection in advance |
| Thumbnail generation benchmark | **12 mixed-format images in about 0.61 seconds**, 400px long edge, on Apple M1 Max after warm-up |
| Loading | Visible thumbnails load first; generation runs in the background, up to **4 at a time** |
| Thumbnail disk cache | Automatic cleanup above **500 MiB** or **25,000 files**; temporary overshoots are possible |
| Requirements | **VS Code 1.92+** or a compatible Cursor version; **macOS 11+** on Mac |
| Setup | No separate runtime or compilation tools required |

Cache cleanup is automatic. For manual gallery cleanup, run **Image Viewer: Clean Gallery WebView Image Cache**. [Cache details](./docs/usage-notes.md#image-caches).

## Image formats

The gallery and image-editor entry recognize these extensions:

| Formats | Viewing notes |
| --- | --- |
| JPEG / JPG, PNG, WebP, BMP, ICO | Common raster images, including transparent images where the format supports them |
| SVG | Vector images, displayed directly |
| GIF, APNG | Original-image animation depends on the host; generated thumbnails use a static first frame |
| AVIF | Display and thumbnail availability depend on the host version and platform decoder |
| TIF / TIFF | Gallery thumbnails can be generated for decodable files; a visible thumbnail does not guarantee large-image preview |

## Feedback

- [Changelog](./CHANGELOG.md)
- [Report a bug or request a feature](https://github.com/ZhangJian1713/vscode-image-viewer/issues)
- Contact: zhangjian1713@gmail.com
