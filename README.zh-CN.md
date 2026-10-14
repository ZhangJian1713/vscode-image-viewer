# Image Viewer

[English](./README.md) | **中文**

**推荐将 Image Viewer 设为 VS Code 的默认图片查看器。** 提供最高 **800%** 的缩放预设、空格/单击切换缩放、旋转与翻转、导航小地图，以及同目录图片连续切换。[设置方法](#设为默认查看器)。

也可以在 **VS Code 和 Cursor** 中通过连续图片墙浏览项目素材，用目录、搜索和筛选快速找到需要的图片。

点击截图可放大查看。

## 视频演示

查看图片墙浏览与目录定位的实际操作。

<video src="https://raw.githubusercontent.com/ZhangJian1713/vscode-image-viewer/main/assets/demos/gallery-demo.mp4" poster="https://public-img-1253867148.cos.ap-singapore.myqcloud.com/img-in-docs/vscode-image-viewer/gallery-demo-poster.webp" width="800" style="max-width:100%;height:auto;" controls preload="none"></video>

[观看或下载视频](https://raw.githubusercontent.com/ZhangJian1713/vscode-image-viewer/main/assets/demos/gallery-demo.mp4)。

## 快速开始

| 使用场景           | 操作                                                                                                  |
| ------------------ | ----------------------------------------------------------------------------------------------------- |
| 打开一张图片       | 在 Explorer（资源管理器）中右键图片 → **Open With...** / **Reopen Editor With...** → **Image Viewer** |
| 设为默认图片查看器 | 打开命令面板（`Ctrl+Shift+P` / `⌘⇧P`）→ **Image Viewer: Use as Default Image Editor**                 |
| 浏览工作区图片     | 打开文件夹或工作区 → 从命令面板运行 **View Images 🌄**                                                |
| 浏览指定文件夹     | 在 Explorer 中右键文件夹 → **View Images 🌄**，打开项目图库并定位到该目录                             |

## 单图查看器

放大检查细节，通过导航小地图移动视角，或连续查看同目录图片；这些操作不修改原文件。

[![单图查看器：缩放、旋转、翻转与导航缩略图](https://public-img-1253867148.cos.ap-singapore.myqcloud.com/img-in-docs/vscode-image-viewer/single-image-editor-blue-marble.webp)](https://public-img-1253867148.cos.ap-singapore.myqcloud.com/img-in-docs/vscode-image-viewer/single-image-editor-blue-marble.webp)

- **缩放与平移：** 使用鼠标滚轮、工具栏或输入百分比；按 **Space** 或单击图片，在适合当前图片的两到三个缩放档位间循环；缩放预设最高 **800%**。
- **查看细节：** 放大后拖动图片，或通过导航小地图移动查看位置。
- **旋转与翻转：** 向左或向右旋转，水平或垂直翻转，不修改原文件。
- **切换图片：** 使用工具栏、侧边箭头或键盘查看同目录中的其他图片，顺序跟随 Explorer 的排序设置。
- **专注看图：** 控件在空闲时自动淡出；也可以打开工作区以外的图片。

### 设为默认查看器

运行 **Image Viewer: Use as Default Image Editor**，即可默认使用本查看器打开受支持的图片文件。安装或升级扩展不会自动更改默认编辑器。

[![通过 VS Code 命令面板设置默认图片编辑器](https://public-img-1253867148.cos.ap-singapore.myqcloud.com/img-in-docs/vscode-image-viewer/set-default-image-editor-command.webp)](https://public-img-1253867148.cos.ap-singapore.myqcloud.com/img-in-docs/vscode-image-viewer/set-default-image-editor-command.webp)

如需移除这些关联，请在卸载前运行 **Image Viewer: Restore VS Code's Default Image Editor**。该命令不会恢复被设置命令覆盖的其他自定义关联。[默认编辑器关联说明](./docs/usage-notes.md#默认编辑器关联)。

## 工作区图库

新图库默认使用 Grid。从侧栏选择文件夹，在连续的图片墙中浏览；点击任意缩略图打开大图预览。Grid 和 Fill 支持 **1 ～ 20 列**、实时调整缩略图大小，以及减少间距的紧凑模式。

### Grid（默认）：查看完整图片

保持图片原始比例，不裁切内容，适合比较竖图、横图和全景图。

[![Grid 网格布局：保持图片原始比例](https://public-img-1253867148.cos.ap-singapore.myqcloud.com/img-in-docs/vscode-image-viewer/gallery-grid-photos.webp)](https://public-img-1253867148.cos.ap-singapore.myqcloud.com/img-in-docs/vscode-image-viewer/gallery-grid-photos.webp)

### Fill：快速浏览缩略图

缩略图裁切填满方格，适合一屏浏览、快速寻找图片。

[![Fill 填充布局：Folders 侧栏与连续图片墙](https://public-img-1253867148.cos.ap-singapore.myqcloud.com/img-in-docs/vscode-image-viewer/gallery-fill-photos.webp)](https://public-img-1253867148.cos.ap-singapore.myqcloud.com/img-in-docs/vscode-image-viewer/gallery-fill-photos.webp)

### Compact 与缩略图大小

打开底部工具栏的 **Compact** 开关。Grid/Fill 下会去掉缩略图间距和常驻的文件名、大小，鼠标悬停时再显示文件名。**Fill + Compact** 将图片拼成无缝的图片墙，在相同列数下，一屏能看到更多图片。

拖动 **Thumbnails** 滑动条可调整 **1 ～ 20 列**：向右图片更大、列数更少；向左缩略图更小、一行能显示更多。拖动时提示当前像素大小和列数。下图将前面 Fill 示例的 6 列调整为 **4 列 + Compact**。

[![Fill + Compact 四列图片墙，缩略图大小为 260 px](https://public-img-1253867148.cos.ap-singapore.myqcloud.com/img-in-docs/vscode-image-viewer/gallery-fill-compact-photos.webp)](https://public-img-1253867148.cos.ap-singapore.myqcloud.com/img-in-docs/vscode-image-viewer/gallery-fill-compact-photos.webp)

### List：查看文件信息

在缩略图旁查看文件名、相对路径、大小、原图尺寸和修改时间。

[![List 列表布局：路径、大小、尺寸与修改时间](https://public-img-1253867148.cos.ap-singapore.myqcloud.com/img-in-docs/vscode-image-viewer/gallery-list-photos.webp)](https://public-img-1253867148.cos.ap-singapore.myqcloud.com/img-in-docs/vscode-image-viewer/gallery-list-photos.webp)

截图素材的[署名与许可](./assets/screenshots/CREDITS.md)。

### 主题切换

点击右下角齿轮左边的主题按钮，在 **Follow、Light、Dark** 之间循环切换。

- **Follow**（显示器图标）：继承当前 VS Code/Cursor 的主题与自定义配色，包括用户正在使用的定制主题，让查看器与宿主编辑器保持统一的主题风格。
- **Light**（太阳）和 **Dark**（月亮）：使用以 VS Code 默认明亮/黑暗主题为基础的固定配色，独立于编辑器当前主题。

缩略图背景可单独选择：无背景、用于观察透明区域的棋盘纹，或纯色。

### 从 Explorer 定位

右键文件夹或文件 → **View Images 🌄**。左侧以项目根目录显示目录树，并展开、定位到目标；图片会在图片墙中高亮并打开大图预览，普通文件则定位到所在目录。无图片目录会逐级回退到最近有图片资源的祖先，最后回到项目根节点；关闭预览后回到已定位的缩略图。

同一项目的 Explorer 入口复用一个图库标签页，不同工作区根目录分别打开。外部文件变动后可通过 **Refresh images** 更新；搜索或类型筛选挡住目标时会临时调整，通过 **Restore filters** 恢复。

### 查找与整理图片

- **Image folders（图片目录）：** 展示含图片的目录及其祖先，查看图片数量，展开或折叠分支；支持收起侧栏、调整宽度。
- **从搜索结果返回目录：** 右键图片 → **Reveal in Image folders**，展开、选中并居中所在目录，临时清空图片搜索，在相邻图片中定位并高亮原图；通过 **Restore filters** 恢复搜索，Types 与 Include subfolders 设置继续生效。
- **排序与定位：** 按文件夹分组，或对全部图片统一按名称、修改时间、大小、格式排序；文件夹优先模式下，拖动滚动条会在目录树中高亮当前可见图片的文件夹。
- **文件操作：** 定位文件、复制路径/文件名/Base64，确认后移入系统回收站；右键目录可定位、复制路径或排除该目录。
- **设置与反馈：** 右下角齿轮提供设置、问题反馈和功能建议入口。
- **语言：** 设置 → 常规 → 语言，依次提供“跟随 VS Code”、English、简体中文、繁體中文。默认跟随编辑器，不支持的语言回退英文；切换时同步更新已打开的面板，并保留当前浏览状态。

### 文件夹搜索与 Include/Exclude

在左侧 **Find folder** 中输入文件夹名称的一部分，不区分大小写。目录树保留匹配目录及其祖先，并展开到匹配位置；点击结果即可查看图片。清空搜索后恢复完整目录树。

展开 **Find folder** 右侧的筛选按钮，设置 **folders to include**（包含目录）和 **folders to exclude**（排除目录）。Include 限定要浏览的目录树，Exclude 跳过构建产物等不需要的目录。文件夹搜索在这些规则范围内工作，也可以与图片墙上方的文件名/路径搜索、**Types** 格式筛选一起使用。

规则支持相对于项目根目录的文件夹路径，以及 **Glob 表达式（通配符匹配）**。每行一条，按 Enter 或 **Apply** 应用；Shift+Enter 换行。

| 规则                       | 选择范围                           |
| -------------------------- | ---------------------------------- |
| `assets`                   | assets 及其全部子目录              |
| `assets/{photos,icons}/**` | 两个目录及其子树                   |
| `assets/set-*`             | 名称匹配的 set 目录及其子树        |
| `**/{dist,build}`          | 任意层级的 dist/build 目录及其子树 |

Glob 支持 `*`、`**`、`?`、`[ab]` 等字符集合，以及 `{photos,icons}` 等多选匹配。规则针对**文件夹**，匹配后包含整个子树。Exclude 优先于 Include；Include 留空表示浏览项目中的全部目录。收起输入区后，已应用的规则继续生效。

**Image folders → Include subfolders** 控制图片墙是否包含当前选中目录的子目录图片，与 Include/Exclude 扫描规则独立。

## 性能与使用要求

| 项目           | 参数与表现                                                               |
| -------------- | ------------------------------------------------------------------------ |
| 缩放预设       | 最高 **800%**                                                            |
| 图片墙密度     | Grid/Fill 支持 **1 ～ 20 列**                                            |
| 大图库验证规模 | **10 万张图片、约 1 万个目录节点**，使用模拟数据验证                     |
| 图片墙浏览     | 优先加载当前位置的缩略图，无需预先生成整库缩略图                         |
| 缩略图生成实测 | Apple M1 Max，预热后 **12 张混合格式图片约 0.61 秒**，缩略图长边 400px   |
| 加载方式       | 优先加载当前可见图片，后台最多同时生成 **4 张**缩略图                    |
| 缩略图磁盘缓存 | 超过 **500 MiB** 或 **25,000 个文件**后自动清理，生成期间可能短暂超限    |
| 运行要求       | **VS Code 1.92+** 或兼容的 Cursor 版本；Mac 需要 **macOS 11+**           |
| 安装使用       | 无需另装运行环境或编译工具                                               |

缓存会自动清理。需要手动清理图库缓存时，运行 **Image Viewer: Clean Gallery WebView Image Cache**。[缓存说明](./docs/usage-notes.md#图片缓存)。

## 图片格式

图库和图片编辑器入口识别以下扩展名：

| 格式                            | 查看说明                                                 |
| ------------------------------- | -------------------------------------------------------- |
| JPEG / JPG、PNG、WebP、BMP、ICO | 常见位图；格式支持时可显示透明区域                       |
| SVG                             | 直接显示矢量图片                                         |
| GIF、APNG                       | 原图动画取决于宿主支持；生成的缩略图为静态首帧           |
| AVIF                            | 显示和缩略图可用性取决于宿主版本与平台解码能力           |
| TIF / TIFF                      | 可为能解码的文件生成图库缩略图；有缩略图不代表能打开大图 |

## 反馈

- [更新日志](./CHANGELOG.md)
- [报告问题或提出建议](https://github.com/ZhangJian1713/vscode-image-viewer/issues)
- 联系方式：zhangjian1713@gmail.com
