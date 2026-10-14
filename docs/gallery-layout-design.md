# Gallery：目录树与连续图片墙

## 当前范围

图库保留 `<img>` 与 `right-image-preview` 的 DOM 图片预览，单图编辑器入口不变。本次替换图库手风琴分组：左侧为可收起、可调整宽度的 Folders tree；右侧为统一虚拟化的 Fill / Grid / List 图片墙。相关文件按职责拆分，不在 App 中维护多套派生列表。

首版复用现有扫描范围：普通入口使用当前项目根，Explorer 的文件夹入口使用该目录，图片入口使用其父目录。目录树只包含已扫描图片的直属目录及祖先，不额外扫描空目录。多根工作区和虚拟文件系统仍沿用现有宿主范围限制，未在本轮宣称完整支持。

## 数据流与状态

```text
异步扫描 → 原始图片快照 + projectPath + scopePath
    → 类型过滤 → FolderIndex（直属计数、子节点、递归计数）
    → 当前目录 + Include subfolders → 文件夹优先 / 全局排序
    → 搜索过滤 → 同一图片序列用于图片墙和 Preview
```

- `galleryModel.ts` 按直属目录计数，从叶到根合计；目录名称使用复用的自然排序 Collator。
- 展开状态独立于搜索和图片列表，不由刷新 Effect 重置。目录搜索暂时展开匹配节点的祖先。
- 树右侧数量跟随类型过滤和直属/递归开关，不跟随图片名称搜索；tooltip 同时列出两种计数。
- 切换范围会返回该范围保存的滚动位置；已删除的选中目录回退仍存在的祖先。
- Preview 打开时冻结当前过滤、排序后的序列，不依赖挂载卡片，关闭不卸载图库。
- 项目配置保存布局、紧凑模式、列数、List 缩略图大小、侧栏宽度/显隐、目录选择和展开状态。写入去抖；宿主语言不落盘。

### 两级排序与全局排序

- 默认 `galleryGroupByFolder: true`（旧配置缺失也视为 true），`imageSort: nameAsc`。Sort 下拉分为 Folder → 字段和 All → 字段两组；名称、修改时间、大小、格式均可升降序，两项偏好一起保存。
- `gallerySort.ts` 按图片直属目录分桶，目录逐层使用自然序，父目录先于后代、顺序与树一致；第二级方向仅作用于桶内，不反转目录。名称使用自然序（image2 在 image10 前）；相同字段按名称、完整相对路径稳定决胜。格式按扩展名排序，不合并 jpg/jpeg 等别名。
- 全局模式对当前范围统一按字段排序，允许目录被打散。图片墙与 Preview 共用最终序列；搜索保留该序列的相对顺序。
- 扫描仅收集路径、大小、mtime 等元数据，不依赖磁盘枚举顺序，也不预排用户选择的第二级字段。排序变更复用已收集快照，不重新扫描、不生成全库位置或缩略图。分桶只提取一次图片父路径，目录段仅拆分一次，逐桶排序后拼接，不在图片比较器中重复解析目录。

## Folders tree 与菜单

`FolderSidebar.tsx` 封装已有 Ant Design Tree：虚拟滚动、受控选择/展开、目录搜索、递归计数、侧栏显隐与拖动宽度。所有节点有右键菜单和省略号入口：在 Explorer/系统文件管理器定位、复制完整/项目相对路径、展开/折叠子树、排除扫描。根节点不允许排除。

菜单复用 `GALLERY_RESOURCE_ACTION`，宿主 canonicalize 目标并校验项目边界。图片菜单保留复制 Base64，并提供有确认的移入系统 Trash 操作；不自动降级成永久删除。文件夹删除/移动/重命名未加入本轮范围。

## 筛选、设置与反馈

Folder filters 位于 Find folder 右侧，展开后以 VS Code Search 风格直接显示 folders to include / exclude。Types 与 Sort 使用有底色的图库控件，社群入口使用无边框文字外链及跳转图标。搜索框下不再显示重复路径和独立子目录开关；标题的 breadcrumb 保留用于返回上级目录。Include subfolders 位于 Folders 菜单内，切换时同时更新目录计数与当前结果。

底栏最右侧为主题切换与齿轮 Settings。设置弹窗仅保留 Gallery / Feedback：主题继续使用底栏按钮，图库背景使用工具栏入口，不在设置中重复；图库文件大小可选择名称下方或仅悬停显示，List 大小列不受影响。主题状态继续由 WebviewThemeContext 唯一持有，配置保存时带入当前偏好。

### 主题与缩放

- 三种主题偏好：Follow 动态读取 VS Code 当前注入的颜色，包括第三方主题和 `workbench.colorCustomizations`；Light / Dark 使用预存的默认主题色。
- 底栏图标表示主题偏好：Follow 固定显示编辑器/显示器图标，tooltip 为 Follow VS Code；手动 Light / Dark 分别显示太阳和月亮，不以宿主当前明暗决定 Follow 的图标。
- 固定配色快照为本机 VS Code 1.138.0 的 Light 2026 / Dark 2026。`vscodeDefaultColors.ts` 存储所需 UI token，来源为 Microsoft MIT 授权的默认主题 JSON（已合并 include）；更新默认色需要显式更新快照。旧版 Modern 或自定义主题可选择 Follow 保持当前宿主配色。
- `webviewPalette.ts` 只维护一份 token 映射。背景/文字、输入框、侧栏、按钮、选中态和弹窗从同一 palette 取值；宿主恰好使用对应默认主题且无颜色自定义时，Follow 与手动模式的映射颜色一致。
- `vscodeTheme.ts` 读取 body 的主题种类/class 和 `--vscode-*` 值，使用 OS 明暗仅作最后回退。订阅比较宿主快照，捕获同一明暗种类内的换色；插件自身写入 `--iv-*` 不会触发循环重渲染。切换手动模式不覆盖宿主 token；body portals 与根节点共用插件 palette，卸载时清理。
- 预览的新增高档为 250 / 300 / 400 / 600 / 800%，参考 Media Lens。`previewZoomStops.ts` 由图库和独立单图入口共用，原有 200% 以下档位保持不变。采用 `right-image-preview` 已有 `stops` API，不修改渲染内核或依赖包。
- 定向测试覆盖默认配色一致性、自定义颜色继承、主题检测、同类换色、监听去重与清理。浏览器 Mock 可用 `mockTheme=light|dark|purple` 模拟宿主配色；已检查默认色对比、紫色继承和 800% 上限。真实 VS Code/Cursor 主题切换及独立编辑器仍需 F5 验收。

Feedback 提供已有 Issue 列表、新建 Issue 指引，以及打开邮件应用的 mailto 入口，不自动提交 Issue 或发送邮件。Mock 通过统一 transport 模拟外部链接动作。

### Folder filters 与 Glob

- Find folder 在已扫描目录树中按名字查找；选择结果后按该目录显示图片。include/exclude 限定扫描与计数，二者同时使用；收起输入区不清除已应用的规则。
- 每行一条项目相对目录规则，支持普通路径和 `*`、`**`、`?`、`[]`、`{a,b}`。不按逗号拆分，保留 brace 和旧的逗号目录名。支持 `/` 和 Windows 目录分隔符，普通目录路径继续表示整个子树。
- 匹配某个目录后，该规则作用于整个子树；exclude 优先。`assets/*` 匹配 assets 的直接子目录，并包含这些目录的后代。空 include 表示当前入口的完整范围；`**` 匹配整个范围。
- Explorer 文件夹入口与 include 规则取交集，exclude 同样适用；不会通过规则扩大到入口以外的目录。相较旧实现，该入口现在也遵守 include。
- 输入规则是草稿；Enter / Apply 才保存并扫描，Shift+Enter 换行。关闭输入区丢弃未应用的草稿；外部菜单改变规则时重新载入表单。错误表达式阻止应用，扫描端也验证；错误配置不阻止打开侧栏修正。
- 一组最多 64 条、每条最多 512 字符；不支持 `!` 反选、extglob 或原始 regex。使用 exclude 和 brace alternatives 表达对应意图。类型过滤仍由 Types 管理，目录规则不匹配图片文件名。
- `folderFilterRules.ts` 封装 Picomatch，规则每次扫描只编译一次；从 include 的固定目录前缀开始扫描，合并被父根覆盖的重复根。排除子树在 readdir 前剪枝，只对符合 include 的目录执行图片 stat。静态入口不能通过符号链接逃逸项目边界。
- 浏览器 Mock 使用同一编译计划，并按目录 memo 匹配结果；10 万张 fixture 不逐图片重新编译 Glob。Windows 使用大小写不敏感匹配，其余宿主使用大小写敏感匹配；真实 Windows 文件系统尚未验收。

#### 匹配库选型

比较 [Picomatch](https://github.com/micromatch/picomatch) 与 [minimatch](https://github.com/isaacs/minimatch)。选择封装采用 Picomatch 4.0.7：MIT、无运行依赖、支持预编译 matcher 与静态前缀分析，Node >=12 兼容当前 VS Code 目标，浏览器共用逻辑无需引入文件遍历库。minimatch 功能成熟，但当前最新版要求更高 Node 版本，旧主版本与 brace expansion 的维护/修复边界较复杂，本轮不采用。自主实现仅负责目录子树语义及扫描范围交集，不重新编写 Glob 解析器。

检查了上游文档、发布包元数据和已公开安全公告；4.0.7 覆盖 4.0.4 引入的 [extglob ReDoS 修复](https://github.com/micromatch/picomatch/security/advisories/GHSA-c2c7-rcm5-vvqj) 与 [POSIX class 修复](https://github.com/micromatch/picomatch/security/advisories/GHSA-3v7f-55p6-f55p)，另在应用层限制表达式范围。未作完整依赖安全审计。

## 图片墙与资源预算

`galleryLayout.ts` 参考 Media Lens 的固定行布局：总高度 O(1) 计算，只物化视口附近的项，不为全库创建坐标数组。`VirtualGallery.tsx` 使用一个滚动容器、一个 ResizeObserver、每帧至多一次 viewport 更新。图片卡片按稳定文件路径 memo，不逐卡创建 IntersectionObserver 或 ResizeObserver。

- Fill：同一方形格子内 `object-fit: cover`；Grid：`contain`。
- 缩略图尺寸滑动条统一左小右大：Fill/Grid 反向映射 20～1 列，List 保持 40～160px；加载旧配置时将列数夹紧至 1～20。拖动 tooltip 显示实际渲染边长（CSS px）和有效列数，底栏常驻像素值。虚拟图库只在尺寸/有效列数变化时报告几何，不因滚动同步父组件。
- 背景选项首项为 No background（圆圈斜线图标），其次为 Checkerboard 和纯色。沿用持久化值 `transparent`；缩略图外层不再绘制底色、边框或阴影，透明像素和 Grid 留白直接透出图片墙底色。键盘焦点和悬停菜单仍可见。
- List：缩略图、文件名/相对路径、大小、按需原图尺寸、修改时间；窄面板逐步收起附加列。
- `galleryShowFileSize` 缺省 true；设为 false 时正常 Fill/Grid 标题区从 40px 缩至 26px，tooltip 仍显示大小，不额外读取像素信息。几何变化复用图片锚点恢复，List 和 Compact 几何不受影响。
- Compact：Fill/Grid 无间隙、无常驻名称/大小；hover 显示名称，菜单和键盘预览仍可使用。List 减小行内留白。
- overscan 为半个视口，最多 400px；没有“每目录不足 40 张则全部挂载”的分支。
- 调整列数、侧栏宽度和布局时，按旧布局首个可见图片 ID 与行内比例恢复位置。先保存旧 scrollTop，避免新总高度提交后浏览器夹紧位置导致锚点错误。
- `GalleryThumbnailStore` 限制 6 个并行请求，优先可见项；离屏取消排队需求，未使用 URL 结果最多保留 200 条。卡片卸载释放资源租约。尺寸信息只为 List 可见行读取，失败标为未知。
- 已清理的缩略图加载失败会重试一次，之后提供显式 Retry，不无限循环。Fill/Grid 使用相同尺寸档位与缓存协议。

## 大图快速观察交互

图库 Preview 与独立编辑器共用自适应循环，不改变工具栏/滚轮的固定档位：

- 普通图片 `Fit → 100% → Fit`；Fit 与 100% 差距足够大时加入 Detail（细节观察中间档）。Detail 为两端倍率的几何平均、取最接近的 5%，只有与两端均至少相差 1.5 倍才出现（如 Fit 25% → Detail 50%，Fit 14% → Detail 35%）。
- Fit 上限为 100%。小图的 Fit 与 Native 100% 合并成一个视觉起点，循环改为 `Fit/100% → 200% → Fit`；循环外的手动倍率直接返回 Fit。长按 Space 不重复推进，输入框/按钮及带修饰键的 Space 不触发图片循环。
- Space 放大保留视口中心的图像点；鼠标放大保留光标锚点。Fit 主图左键按下立即放大，当前按压的后续移动不转成 pan；Native 按压先等待，移动超过 4 CSS px 后只平移，否则松手推进循环。双击序列合并成一次，合成 click 被消费，避免变换后的黑色留白误关闭 Preview。触摸/笔继续走原有路径。
- 放大/缩小光标表示下一目标方向；拖动时为 grabbing。每次快速切档短暂显示当前/下一档与拖动提示；无缩放动画。pointerup/cancel、失去捕获、窗口 blur、文档隐藏、图片更换和卸载结束会话，清理 hint timer。

### 预览实现选择

调研了已安装 MIT 的 `right-image-preview` 0.2.0 包和[上游公开 API](https://github.com/ZhangJian1713/right-image-preview)。比较三种方案：直接使用已发布 API、在插件外层封装拦截手势、维护已发布源码快照。现有 API 的 Space/双击仅切 Fit/100%，没有单击仲裁与可控锚点入口；外层封装必须探测私有 DOM 并与 pan 争夺事件，难以可靠维护。本轮采用已发布包的 MIT 源码快照，在内核内部扩展；保留 DOM `<img>`、工具栏、minimap、渐进图源及原有 cache scope，不移植 Media Lens 的 GPU/原生运行时，也不引入新的运行依赖。

`src/vendor/right-image-preview` 从已安装包的 source map `sourcesContent` 与同版本声明恢复，保留 LICENSE（分发副本位于 `assets/licenses/right-image-preview.txt`）、来源说明与独立回归测试；原始包固定为 0.2.0 的开发依赖，运行时只采用本地快照；图库与单图入口直接导入同一快照。升级预览库需要显式合并本地修改，不能自动覆盖。测试覆盖两/三档循环、小图 200%、锚点、repeat/控件排除、拖动阈值、双击合并与会话清理。上游网页缓存与本机已发布包已核对；未核对未发布分支的完整改动。

## 滚动条目录浮窗与树落点

- `useGalleryScrollbarGesture.ts` 识别原生滚动条按压/拖动和轨道大跳转；原生未派发按压事件时以大幅 scroll 跳变兜底，显式排除滚轮、键盘和程序化布局恢复。释放约 600ms 后浮窗淡出；失焦/隐藏/Preview 打开时隐藏，监听、rAF 和 timer 随生命周期清理。
- `galleryViewportFolders.ts` 从统一行几何算实际图片相交的下标区间，仅遍历该区间，排除 overscan、已离屏图片、纯 caption 与空隙。按屏幕顺序去重父目录；非拖动时不重复计算目录提示。
- 右缘浮窗列出相对当前选中目录的路径。高度预算为视口的 45%、最多 360px；头尾保留、中间省略；共享至少两段公共祖先时抽成标题。浮窗不拦截指针，三角指向估算的 thumb 中心。
- 目录浮窗和树联动仅在文件夹优先排序启用。切到全局排序即关闭手势跟踪、浮窗与树高亮，并清除旧落点，避免分散图片对应的目录缺乏代表性。
- Folders 树以整组高亮行的上下边界居中，并高亮当前屏内节点（整组超高时以中位高亮行居中，列表首尾夹紧），不改变 selectedKeys 或图片过滤范围。临时展开只派生自当前屏内祖先，途经目录不会累积；松手后保留落点，滚轮与树自身滚动不驱动定位；打开/关闭 Preview 保留落点。改变范围/序列或点击目录清除高亮。
- 树行与虚拟化估算统一为 32px；定位只在拖动同步时执行，不抢占松手后的手动滚动。高亮统一使用浅色底，包住图标与名称，不绘制竖条，也不单独加深第一项。
- 用户展开状态与临时状态分开。拖动期间仅展开 root 和当前屏内图片直属目录的祖先路径，暂时覆盖手动/搜索展开；每次视口变化重新派生，离屏分支立即收起，不展开只有离屏图片的后代。自动跟踪不回写配置；松手后恢复手动/搜索展开并保留落点。树的 onExpand 只保存用户操作的节点；松手后点击三角可收起落点祖先，不会被派生展开顶开；目录搜索继续保留自己的过滤范围和关键词。
- 当前浏览器实测会将过大的 CSS 内容高度截断为约 1677 万 px；单列十万图片的逻辑高度可能超过此值。`galleryLayout.ts` 将真实滚动高度限制在 800 万 px，在 physical scrollTop 与完整逻辑行坐标间线性映射。可见卡片按相对视口位置投影，几何窗口、锚点恢复和目录提示仍使用逻辑坐标；不会为全库生成位置数组。`useLogicalGalleryScroll.ts` 只在高度被压缩时接管滚轮与分页键，将输入步长按逻辑屏幕像素换算；保留触控板小数累计，避免滚动步长随压缩比例放大。
- macOS 内置浏览器 Mock 已验证实际拖动的浮窗、树高亮、选择范围保持，三档键鼠循环，以及十万张单列到达最后一张。此处真实 VS Code WebView 的滚动条、触摸/笔与 Windows/Linux 尚需实机验收；不将 Mock SVG 测试当作原图解码/磁盘吞吐 Benchmark。
- Mock 增加 `mockSession` 隔离测试偏好，`imageScale=1..4` 提供较大固有尺寸的 SVG 以检验三档循环；均只用于显式开发模式。

## 宿主扫描与缩略图缓存

扫描改为异步目录遍历和每批 16 个 stat，跳过 node_modules、AppleDouble 与符号链接；一个面板的新扫描会取消上一请求，前端 request generation 阻止迟到结果覆盖当前范围。扫描完成后发布完整快照，本轮未实现流式首批图片或文件变化 watcher。

缩略图继续使用 sips / Jimp / WebP WASM 后端及 100/200/400/800/1600 档位。相同缓存输出合并生成，跨面板最多同时生成 2 张；失败仍保留原有原图回退行为。

磁盘容量为 500 MiB、文件数为 25,000。启动约 3 秒后检查，此后每 2 分钟检查；新增缩略图也触发去抖检查。超限按近似 LRU 回收到两个上限的 85%。这是后台软上限，短期生成高峰可能超过阈值，不承诺任意时刻的严格硬上限。清理串行单飞、最多 32 个并行 stat / 16 个 unlink，允许文件检查期间消失。删除磁盘文件同时失效 memo，命中时也验证文件仍存在。

宿主 WebView CacheStorage 继续由现有 ResourceCacheBoundary 管理；它与缩略图磁盘缓存分开。虚拟化卡片、Preview 主图及 minimap 均保留相应活跃租约。

## 开发与验证

- F5 的 `Run Extension` 会启动 UI/Extension watch；也可先执行开发模式 Webpack 编译后用现有启动配置。
- `yarn ui-dev` 后打开 `http://127.0.0.1:5000/?mock=1`；`count=100000&folders=1000` 可放大 fixture。Mock 仅在开发模式、HTTP 页面且显式 query 启用，使用合成 SVG 与独立 localStorage，不访问或删除真实文件。
- 浏览器服务才替换 HTML 中的宿主占位符。普通 UI watch/build 保留占位符，供 F5 自定义编辑器注入真实图片参数。
- 定向测试覆盖目录边界/计数、折叠、几何窗口、请求去重/并发/淘汰、异步扫描取消/排除/符号链接，以及真实临时文件缓存的启动淘汰与失效 memo。
- 浏览器检查覆盖三种布局、紧凑模式、目录选择与计数、菜单、搜索、侧栏显隐、Preview、长列表与窄面板。Mock 不能代替真实解码、磁盘吞吐和 Extension Host 交互验收；最终真实目录效果由 F5 验证。
