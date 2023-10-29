## View Images in current project  
![screenshot](https://public-img-1253867148.cos.ap-singapore.myqcloud.com/img-in-docs/15w87zqq.png)  
![screenshot](https://public-img-1253867148.cos.ap-singapore.myqcloud.com/img-in-docs/2u85YQG.png)  

### Features
- Display all images as thumbnails, support resizing thumbnails and previewing origin image(zoom in/out or rotate freely)
- Copy [Base64 coding | name | path] of any choosen images
- Toggle the background color of images (Useful for transparent images such as SVG or PNG)  
- Search image by name/type/path
- Optimized performance when there are many images (Tested with 10,000 images, switch to lazy loading when the images exceeds 100)

## Settings
You can customize the folders that the Image Viewer searches for images using the settings:
```json
"zhangjian1713.image-viewer.includeFolders": [
    "/src/media",
    "/dist/media"
]
```

## How to use  
- Method 1: Open a project/folder and right-click at anywhere and click `View Images`, then the webview of `Image Viewer` will appear.    
![screenshot](https://public-img-1253867148.cos.ap-singapore.myqcloud.com/img-in-docs/3oVW4mqE.png)  
- Method 2: Open vscode command palette by press `Ctrl+Shift+P` or `Command⌘+Shift⇧+P`, then input `View Images` or `vscode-infra.webviewImageViewer` and press `Enter`.  

## More Screenshots  
![screenshot](https://public-img-1253867148.cos.ap-singapore.myqcloud.com/img-in-docs/47kZgCa.png)
![screenshot](https://public-img-1253867148.cos.ap-singapore.myqcloud.com/img-in-docs/5lCM0JMb.png)

## Questions or feedback  
zhangjian1713@gmail.com