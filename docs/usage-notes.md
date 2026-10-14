# Usage notes / 使用补充说明

[English README](../README.md) · [中文 README](../README.zh-CN.md)

## Default editor associations

Run **Image Viewer: Use as Default Image Editor** to open supported image files with this viewer by default. Installing or updating the extension leaves your editor choice unchanged.

To remove these associations, run **Image Viewer: Restore VS Code's Default Image Editor**. VS Code then uses its normal editor selection; this does not restore a previous custom association overwritten by the setup command.

Both commands update the global User `workbench.editorAssociations` setting. Workspace and Workspace Folder settings can override it. The restore command removes only supported image associations that still point to Image Viewer, preserving unrelated or subsequently changed associations. Run it before uninstalling if you want to remove those global associations.

## Image caches

VS Code and Cursor may cache full copies of images loaded in a WebView (an embedded browser view). Image Viewer cleans old image resource caches in the background after the initial render and a browser idle window. During use, it prunes resources no longer used by open panels, with a short grace period for navigation.

The gallery and single-image editor have separate cache scopes. Open each viewer after upgrading to clean its accessible historical cache. Closing the last panel in a scope attempts to clear it; crash or forced-exit residue is cleaned on the next opening if the host reuses that scope. The gallery's thumbnail disk cache is separate from these resource caches. It is checked shortly after opening and every two minutes: above 500 MiB or 25,000 files, older entries are removed toward 85% of both limits. These are background soft limits, so brief overshoots are possible while thumbnails are generated.

For immediate gallery cleanup, run **Image Viewer: Clean Gallery WebView Image Cache**. This command does not clean the single-image editor's cache. Old cache scopes abandoned by the host cannot be reached by the extension and may need manual cleanup while VS Code or Cursor is closed.

## Development preview

Run `yarn ui-dev`, then open `http://127.0.0.1:5000/?mock=1`. Add `&count=100000&folders=1000` to test a large collection. Mock mode uses generated SVG images and isolated browser settings; file actions do not affect real files. It is available only in development browser builds. Use F5 → **Run Extension** to check real workspace images and host interactions.

## 默认编辑器关联

运行 **Image Viewer: Use as Default Image Editor**，即可默认使用本查看器打开受支持的图片文件。安装或升级扩展不会自动更改默认编辑器。

要移除这些关联，运行 **Image Viewer: Restore VS Code's Default Image Editor**。此后由 VS Code 按正常规则选择编辑器；该命令不会恢复被设置命令覆盖的其他自定义关联。

两个命令都会修改全局 User 设置中的 `workbench.editorAssociations`，工作区和工作区文件夹设置可以覆盖它。恢复命令只移除仍指向 Image Viewer 的受支持图片关联，保留无关或后来改过的关联。如需在卸载时清理这些全局关联，请先运行恢复命令。

## 图片缓存

VS Code 和 Cursor 可能缓存 WebView（内嵌浏览器视图）加载过的完整图片副本。Image Viewer 会在首屏渲染后、浏览器获得空闲时间片时后台清理旧图片资源缓存。使用过程中会回收不再被打开的面板使用的资源，并为图片切换保留短暂宽限期。

图库与单图编辑器使用独立的缓存作用域。升级后分别打开两种查看器，即可清理各自能访问到的历史缓存。同一作用域内最后一个面板关闭时会尝试清空缓存；崩溃或强制退出后的残留，会在宿主复用该作用域、再次打开查看器时清理。图库的缩略图磁盘缓存与这些资源缓存相互独立。它在打开后及每两分钟检查一次：超过 500 MiB 或 25,000 个文件时，淘汰旧条目直到降至两个上限的 85%。这些是后台软上限，缩略图生成高峰中可能短暂超限。

需要立即清理图库缓存时，运行 **Image Viewer: Clean Gallery WebView Image Cache**；此命令不清理单图编辑器缓存。宿主遗留且已不可达的旧缓存作用域无法由扩展清理，可能需要退出 VS Code 或 Cursor 后手动处理。

## 开发预览

运行 `yarn ui-dev`，然后打开 `http://127.0.0.1:5000/?mock=1`。添加 `&count=100000&folders=1000` 可测试大图库。Mock 使用合成 SVG 和独立浏览器配置，文件菜单操作不会影响真实文件，仅开发模式的浏览器构建可启用。真实工作区图片和宿主交互请通过 F5 → **Run Extension** 验证。
