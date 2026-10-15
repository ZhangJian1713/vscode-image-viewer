# 项目开发约定

## Right Image Preview 本地联调与发布

- 只有用户明确要求发布 `right-image-preview` 新版本时，才允许发布；组件改动需要联调，不构成发布授权。
- 开发联调临时通过 `link:../../../jsws/right-image-preview` 引用 `/Users/zj/jsws/right-image-preview` 的构建产物；修改组件后先在该项目运行 `npm run build:lib:release`，再重建扩展 WebView。不在扩展中恢复组件源码副本，也不为测试安装新发布版本。
- `/Users/zj/jsws/right-image-preview_0.7.1` 是用户备份，不得修改。
- 本地组件仓库有自己的 React 开发依赖。Webpack、Jest 和 TypeScript 必须统一使用扩展的 React 17 运行时及类型，避免重复 React 或混用 React 19 类型。
- 真正发布扩展时，将临时 `link:` 依赖切回官方 npm registry 的最新已发布版本并锁定具体版本，更新 `yarn.lock` 后验证。若所需组件改动尚未发布，先向用户说明，不能自行发布组件来推进扩展发版。

## 邻图预加载试用

单图与图库目前均试用 `preloadRadius={1}`、`preloadDisplaySlots={2}`、`preloadDisplayMode="slot"`：预热前后各一张，并保留最多两个邻图展示槽位。停稳延迟沿用组件默认 600ms；DOM 解码位图保留是 best effort，不承诺永久驻留。回归测试仍可按各自关注点显式关闭预加载。

## 底片条联调

单图与图库均提供独立底片条开关，分开记忆，默认关闭。单图只显示直属目录图片。底片条对大位图生成 200px 档位小图，不按文件字节大小跳过；SVG 和已确认长边不超过 200px、可由浏览器显示的小位图直接使用原文件，在底片格内允许放大。TIFF 等需要格式转换的图片仍走生成，生成失败不回退原图；图库和所有预览共享最多六个生成任务，按可见虚拟窗口请求，禁止全目录预生成。
