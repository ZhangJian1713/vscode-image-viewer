# Image Viewer

Browse and manage images in your workspace, or open individual image files directly in a full-screen custom editor. Includes a thumbnail grid, large preview, copy Base64 / path / file name, and per-project include/exclude folders.

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
- **Optional default editor:** open individual image files directly in the full-screen viewer without scanning or briefly displaying the image library.

## How to use

1. Open a folder or workspace in VS Code / Cursor.
2. **Whole workspace:** `Ctrl+Shift+P` / `⌘⇧P` → run **View Images** (command id: `vscode-infra.webviewImageViewer`).
3. **Folder only:** In the **Explorer**, right-click a **folder** (or an image file) → **View Images 🌄**. Only that directory (and subfolders) is indexed in that panel; the editor tab title reflects the folder.
4. **Individual image:** right-click an image and choose **Open With...** / **Reopen Editor With...** → **Image Viewer**.
5. **Use Image Viewer by default:** run **Image Viewer: Use as Default Image Editor** once. See [Use as the default image editor](#use-as-the-default-image-editor) for details.

## Use as the default image editor

Image Viewer is registered as an optional, read-only custom editor. Installing or updating the extension does **not** change your default editor automatically.

To make it the default for supported images:

1. Open the Command Palette with `Ctrl+Shift+P` / `⌘⇧P`.
2. Run **Image Viewer: Use as Default Image Editor**.
3. Open an image from Explorer. It opens directly in the full-screen viewer without scanning the surrounding folder or creating an additional gallery tab.

The command applies to these filename patterns:

`*.svg`, `*.png`, `*.jpeg`, `*.jpg`, `*.ico`, `*.gif`, `*.webp`, `*.bmp`, `*.tif`, `*.tiff`, `*.apng`, `*.avif`

To stop using Image Viewer as the default, run **Image Viewer: Restore VS Code's Default Image Editor**. This removes Image Viewer's global associations for the supported patterns and returns control to VS Code's normal editor selection. It preserves unrelated editor associations and any target association that no longer points to Image Viewer.

These commands update the global User `workbench.editorAssociations` setting. Workspace or Workspace Folder associations can override the global choice. Before uninstalling Image Viewer, run the restore command if you want to remove its global associations; uninstalling an extension does not edit your User settings.

## More documentation

- See **[CHANGELOG.md](./CHANGELOG.md)** for release notes
- Issues: [GitHub Issues](https://github.com/ZhangJian1713/vscode-image-viewer/issues)

## Questions or feedback

zhangjian1713@gmail.com
