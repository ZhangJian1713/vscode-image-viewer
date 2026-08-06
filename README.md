# Image Viewer

View and manage images in your workspace: thumbnail grid, large preview, copy Base64 / path / file name, and per-project include/exclude folders.

## Screenshots

### Main panel

![Image Viewer main panel — folder group preview in dark theme](https://public-img-1253867148.cos.ap-singapore.myqcloud.com/img-in-docs/dark%20theme%2C%20big%20pictures.png)

![Image Viewer main panel — image preview in dark theme](https://public-img-1253867148.cos.ap-singapore.myqcloud.com/img-in-docs/dark%20theme%2C%20big%20pictures%20-%20view.jpg)

This shows another light theme style, as well as switching to a checkerboard background to reveal the transparent parts of SVG images.
![Image Viewer main panel — SVG with transparent background in light theme](https://public-img-1253867148.cos.ap-singapore.myqcloud.com/img-in-docs/light%20theme%EF%BC%8Csvg%20icons.png)

## Features

- The full-screen viewer is now powered by our own preview engine, with a smoother browsing experience.
- Moving to next/previous images now feels more natural and follows the folder order you see in the panel.
- The small overview map in preview looks clearer and loads faster, especially for very large images.
- Preview interactions are richer and easier to use (mouse wheel zoom, double-click zoom, quick flip, and easier navigation buttons).
- Thumbnail grid with **lazy loading** and tuning for large libraries (many high-resolution images).
- **Column count** controls grid density (uses panel width efficiently).
- **Sort** images inside each folder (name, modified time, size, asc/desc).
- **Light / dark** UI for the panel; default follows your VS Code or Cursor theme (toggle in the toolbar).
- Preview backdrops: **checkerboard**, **transparent** (default), and solid swatches; useful for PNG/SVG with alpha.
- Zoom and navigate with keyboard.
- **Search** by path/name; filter by **file type**.
- **Include / exclude** folders
- **Copy** path, file name, or Base64 from the image menu.
- Open a folder from Explorer: **only that folder tree** is scanned (fast in huge repos). **Multiple** Image Viewer tabs for different folders; tab title includes the folder name.
- Optionally register Image Viewer as the default editor so clicking an image in Explorer opens it immediately in the gallery preview.

## How to use

1. Open a folder or workspace in VS Code / Cursor.
2. **Whole workspace:** `Ctrl+Shift+P` / `⌘⇧P` → run **View Images** (command id: `vscode-infra.webviewImageViewer`).
3. **Folder only:** In the **Explorer**, right-click a **folder** (or an image file) → **View Images 🌄**. Only that directory (and subfolders) is indexed in that panel; the editor tab title reflects the folder.
4. **Open images on a normal click:** run **Image Viewer: Use as Default Image Editor** once. Run **Image Viewer: Restore VS Code's Default Image Editor** to undo the association.

You can also switch editors for an individual file with VS Code's **Reopen Editor With...** command.

## More documentation

- See **[CHANGELOG.md](./CHANGELOG.md)** for release notes
- Issues: [GitHub Issues](https://github.com/ZhangJian1713/vscode-image-viewer/issues)

## Questions or feedback

zhangjian1713@gmail.com
