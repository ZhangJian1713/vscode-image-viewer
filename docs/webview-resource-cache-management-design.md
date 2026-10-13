# WebView 图片资源缓存治理设计

## 1. 状态

- 文档状态：核心实现、代码 review、Extension Development Host 冒烟验证，以及真实 VS Code/Cursor 历史缓存迁移均已完成
- 适用范围：项目图库 `PreviewImages` 与单图自定义编辑器 `vscode-infra.imageViewer`
- 当前阶段：历史迁移、租约 GC、显式清理命令和安全熔断已实现
- 不在本阶段处理：直接修改 VS Code/Cursor、发布版本、自动删除宿主应用磁盘目录

---

## 2. 背景与问题

插件使用 `Webview.asWebviewUri` 将本地图片转换为 WebView 可加载的资源 URL，再交给 `<img>`：

```text
本地图片
  → webview.asWebviewUri(...)
  → https://file+.vscode-resource.vscode-cdn.net/...
  → VS Code WebView service worker
  → <img>
```

VS Code WebView service worker 对满足以下条件的资源响应调用 `cache.put`：

- 请求方法为完整 `GET`；
- 请求没有 `Range` header；
- 扩展宿主返回了 ETag。

响应流会同时交给页面和 CacheStorage。缓存名称为：

```text
vscode-resource-cache-<service worker version>
```

当前本机 VS Code 1.138.0 和 Cursor 3.20.21 使用 `VERSION = 6`。service worker 没有容量淘汰逻辑，激活新版本时也不会删除旧版本 cache。

因此，插件曾经显示过的本地原图会在宿主的 WebStorage 中留下完整副本。文件后来被压缩、移动或删除，不会自动移除旧响应。长期浏览大量图片后，CacheStorage 会按浏览历史持续增长。

本机调查结果：

| 宿主与 WebView | WebStorage | CacheStorage 大小 | 说明 |
|---|---:|---:|---|
| Cursor 图库 `PreviewImages` | `WebStorage/11` | 约 41GB | 其中 cache-4 约 40GB，cache-6 约 972MB |
| Cursor 单图编辑器（当前可达 origin） | `WebStorage/17` | 迁移前约 176MB | 独立 origin；迁移后约 12KB |
| Cursor 单图编辑器（历史孤立 origin） | `WebStorage/16` | 约 2.1MB | 旧 origin 已不可达，扩展无法跨 origin 删除 |
| VS Code 图库 `PreviewImages` | `WebStorage/7` | 约 4.0GB | 含 cache-4、cache-5、cache-6 |
| VS Code 单图编辑器 | `WebStorage/14` | 约 121MB | 独立 origin |

插件自己的网格缩略图缓存位于 `ExtensionContext.globalStorageUri/image-viewer-grid-thumbs/`，已有约 500MB 的容量治理。它与本设计处理的宿主 CacheStorage 是两套独立缓存。

### 2.1 上游依据

- VS Code service worker 当前实现：<https://github.com/microsoft/vscode/blob/main/src/vs/workbench/contrib/webview/browser/pre/service-worker.js>
- VS Code 已确认的无限增长问题：<https://github.com/microsoft/vscode/issues/320928>
- WebView panel origin 创建逻辑：<https://github.com/microsoft/vscode/blob/main/src/vs/workbench/api/browser/mainThreadWebviewPanels.ts>
- WebView origin store：<https://github.com/microsoft/vscode/blob/main/src/vs/workbench/contrib/webview/browser/webview.ts>

---

## 3. WebView 身份与缓存归属

### 3.1 逻辑 origin 与实际存储 origin

宿主不会按“图片目录”或 workspace 路径划分 CacheStorage。VS Code 会持久化以下逻辑映射：

```text
(WebView 类型 viewType, 扩展 ID extensionId) → 随机 origin UUID
```

普通 WebView panel 和 custom editor 使用不同的 origin store。因此，本插件至少有两个独立 origin：

```text
图库：
  viewType = PreviewImages
  extensionId = vscode-infra.image-viewer

单图编辑器：
  viewType = vscode-infra.imageViewer
  extensionId = vscode-infra.image-viewer
```

图库与单图编辑器使用不同的逻辑 origin。宿主再用父窗口 origin 与这个 UUID 计算
`vscode-webview://<encoded-origin>`；Chromium 的 CacheStorage 实际归属于这个计算后的
storage origin。

正常情况下，只要宿主保留上述映射且父窗口 origin 不变，同一 `viewType` 会重新得到相同的
storage origin。不过真实 Cursor 数据表明，历史上可能因宿主升级、origin 映射重建或其他宿主
内部变化留下旧的、已经无法从当前映射计算出来的 storage origin。扩展只能访问当前页面的
CacheStorage，不能枚举或跨 origin 删除这些孤立目录。

### 3.2 关机后是否还能清理

通常可以。origin UUID 保存在宿主的 `User/globalStorage/state.vscdb`，单纯重启、关机或关闭面板
通常不会改变它。升级后的插件不需要打开同一个图片目录：

- 重新打开任意一个图库面板，可以访问图库 origin 下的旧 cache；
- 重新打开任意一张使用本插件单图编辑器的图片，可以访问当前映射对应的单图编辑器 origin 下的旧 cache。

以下情况会使旧 origin 不再可达：

- 用户删除或重建了 `state.vscdb`；
- 扩展 ID 或 `viewType` 被修改；
- 宿主升级或内部迁移后重新生成了 encoded storage origin；
- 宿主未来改变 origin 生成或持久化机制；
- 用户升级后再也不打开对应类型的 WebView。

对于不可达 origin，扩展 API 没有枚举或删除宿主 WebStorage 目录的能力，只能提供离线手动清理说明。

### 3.3 不使用 `WebStorage/<数字>` 作为身份

`WebStorage/11`、`WebStorage/7` 等编号由 Chromium 内部管理，不是公开稳定 API。插件不得：

- 硬编码目录编号；
- 猜测 Cursor、VS Code 或其他发行版的用户数据目录；
- 在宿主运行时从扩展进程直接删除 CacheStorage 文件；
- 解析并修改 Chromium CacheStorage 内部索引。

所有自动治理必须从对应 origin 内，通过标准 CacheStorage API 完成。

---

## 4. 目标与非目标

### 4.1 目标

1. 升级后的插件在用户下一次使用对应 WebView 时，自动清理本插件 origin 内的历史 `vscode-resource-cache-*`。
2. 正常使用期间，图片缓存不再随“历史上看过多少张图片”单调增长。
3. 保持当前大图使用 `asWebviewUri` + `<img>` 的显示路径，不改成整文件 `postMessage` + blob。
4. 支持同一 `viewType` 下多个并列面板，不互相删除正在使用的图片。
5. 崩溃或强制退出后的残留，在下一次打开相同 `viewType` 时收敛。
6. CacheStorage API 不可用或宿主实现改变时，看图功能仍可工作。
7. 更新设计文档、用户清理说明和针对性测试。

### 4.2 用户感知与启动优先级

自动迁移不阻塞 WebView 挂载，不显示通知、进度条或弹窗。初始化时先让 React 完成首屏绘制，
并预留 1.5 秒让第一张可见图片开始加载；随后等待浏览器 idle window，最长再等待 3.5 秒后
启动清理。显式清理命令不使用这段延迟。

历史 `vscode-resource-cache-*` 按版本串行调用 `caches.delete(name)`，避免同时删除多个大型
cache 造成不必要的磁盘 I/O 峰值。CacheStorage API 返回 Promise，规范要求删除工作并行于
调用页面执行；因此不会用同步 JavaScript 卡住渲染线程，但宿主的物理磁盘回收仍可能产生
有限的后台 I/O。41GB Cursor 实测中，图库立即显示，磁盘目录约 15 秒后收敛；该次 workspace
没有图片，因此不能把这次结果等同于所有硬盘和所有图片负载下“绝对零抖动”。

### 4.3 非目标

1. 不保证查看过程中磁盘上完全没有临时副本。
2. 不保证崩溃或强制退出后立即零残留。
3. 不修改 VS Code/Cursor 的 service worker。
4. 不从扩展进程直接管理宿主用户数据目录。
5. 不在本次改动中替换 `right-image-preview` 或重写缩略图生成后端。
6. 不把调查自动扩展为 loopback HTTP 图片服务器方案；该方向只作为未来备选。

---

## 5. 总体设计

治理分为两层：

```text
第一次运行新版 WebView
  └─ 历史迁移：删除旧时代积累的 resource cache

之后的每次正常使用
  └─ 稳态 GC：只保留所有存活面板当前正在使用的图片
       ├─ 活跃资源租约
       ├─ 宽限期
       ├─ 延迟/周期清理
       └─ 存储高水位熔断
```

历史迁移不阻塞图片列表和界面挂载。迁移与新图片写入发生竞争时，最坏结果是当前
CacheStorage 命中失效并在下次访问时重新读取；不会修改原文件，也不会中断已经交给
`<img>` 的响应流。迁移结束后安排补偿扫描，回收迁移期间异步完成的 `cache.put`。

---

## 6. 历史缓存迁移

### 6.1 迁移标识

每个 origin 在 `localStorage` 中保存独立迁移版本：

```text
image-viewer.resource-cache-migration-version = <schema version>
```

该标识只表达“本插件的清理协议版本”，不等同于 VS Code service worker 的 cache 版本。

当清理规则发生实质变化时提升 schema version，使已升级用户重新执行一次迁移。

### 6.2 并发控制

同一 origin 可能同时打开多个图库面板。迁移使用 Web Locks API：

```text
navigator.locks.request(
  'image-viewer-resource-cache-migration',
  { mode: 'exclusive' },
  ...
)
```

获得锁后再次检查迁移标识，防止等待期间另一个面板已经完成迁移。

若 Web Locks API 不可用，使用同源 `localStorage` 的带过期时间锁作为降级方案。当前降级锁租期为 5 分钟，等待迁移使用排队模式，GC 使用 `ifAvailable` 语义。降级锁只用于减少重复工作；删除操作本身保持幂等。

### 6.3 删除范围

迁移只处理名称匹配以下规则的 cache：

```text
/^vscode-resource-cache-\d+$/
```

首次迁移可以删除匹配的全部 cache，而不是逐项读取 20,000 多个历史响应：

```ts
const names = await caches.keys()
await Promise.all(
  names
    .filter(isVscodeResourceCacheName)
    .map((name) => caches.delete(name))
)
```

这样可以同时删除 cache-4、cache-5、cache-6，不需要知道磁盘目录编号，也不需要读取原图响应体。

迁移完成后，后续真正需要的 JS、CSS、WASM、缩略图和原图会由 service worker 按需重新写入当前版本 cache。

### 6.4 执行时序

执行时序：

```text
WebView bundle 已执行
  ├─ 立即挂载图库/编辑器主体并建立资源租约
  ├─ 请求图片列表、加载首屏图片
  └─ 后台执行迁移
       → 删除历史 resource cache
       → 成功后写入迁移标识
       → 延迟补偿扫描，处理并发 cache.put
```

WebView bundle 自身可能在迁移期间被当前 service worker 写回新 cache。该残留体积小且不属于图片浏览历史，后续稳态 GC 不需要删除运行资源。

### 6.5 失败处理

- `caches` 不存在：记录一次诊断信息，不影响已经挂载的应用，不写迁移完成标识。
- `caches.keys()` 或 `caches.delete()` 抛错：记录失败，应用继续运行，下次打开重试。
- 页面在迁移中关闭：不写完成标识，下次重试。
- 删除耗时需要在真实 WebView PoC 中测量；未验证前不设置武断的短超时。
- 不允许迁移失败导致图片查看功能不可用。

### 6.6 主动清理命令

新增命令：

```text
Image Viewer: Clean Gallery WebView Image Cache
```

用途：

- 用户希望立即清理，而不是等待下一次正常进入图库；
- 迁移失败后的手动重试；
- 支持人员要求用户执行可控、可观察的清理操作。

图库清理命令必须使用 `PreviewImages` 这个 `viewType` 创建或复用 WebView，才能进入既有图库 origin。不能使用新的 cleanup `viewType`，否则会得到一个全新 origin，看不到旧缓存。

单图编辑器属于 custom editor 的另一个 origin，普通 panel 即使使用相同字符串也不保证进入 custom-editor origin store。单图缓存应在下一次打开任意单图编辑器时自动迁移；不为了清理而创建临时图片或模拟 custom editor。

---

## 7. 稳态资源租约

### 7.1 为什么需要跨面板租约

当前图库支持多个目录面板。同一 `viewType` 的面板共享 CacheStorage。如果每个面板只按自己的状态删除缓存，会导致：

```text
面板 A 清理
  → 误删面板 B 当前图片的缓存
  → B 下次访问重新读取并再次写盘
  → 形成无意义的抖动
```

因此清理保留集必须是所有存活面板活跃资源的并集。

### 7.2 租约格式

每个 WebView 生成随机 `panelId`，使用独立 localStorage key，避免多个面板并发改写同一个 JSON 对象：

```text
key:
  image-viewer.resource-lease.v1.<panelId>

value:
  {
    "updatedAt": 0,
    "urls": ["..."],
    "kind": "gallery" | "single-editor"
  }
```

租约通过定时心跳续期。页面正常卸载时删除自己的 key；异常退出留下的 key 通过 TTL（Time To Live，生存时间）过期。

当前第一版参数：

- 心跳：10 秒；
- TTL：5 分钟；
- URL 释放宽限期：30 秒；
- `cache.put` 补偿扫描：再延迟 30 秒；
- 周期扫描：60 秒。

TTL 有意明显长于心跳，以容忍隐藏 WebView 的 timer throttling（定时器节流）。参数仍需通过多窗口和长时间隐藏测试校准；即使租约提前过期，最坏结果也是资源被重新读取，不影响图片内容正确性。
- 页面不可见时仍保留租约，因为隐藏标签页的图片可能随时恢复。

### 7.3 图库活跃资源

图库租约包含：

1. 当前由缩略图 retention registry 持有、并已经得到实际 `src` 的网格图片；
2. 当前大图预览使用的原图 URL；
3. 正在切换、尚未完成 load/decode 的下一张原图；
4. 刚释放但仍处于竞态宽限期的 URL。

不把整个 workspace 图片列表写入租约。否则缓存上限仍然等于图库大小。

### 7.4 单图编辑器活跃资源

单图编辑器目前只挂载当前选中的原图。租约包含：

- 当前显示的原图；
- 正在切换的新原图；
- 短暂宽限期内的上一张原图。

传给 `right-image-preview` 的完整兄弟图片列表只是导航数据，不代表这些图片全部活跃。

### 7.5 宽限期

VS Code service worker 使用 `ReadableStream.tee()`，页面显示完成与 `cache.put()` 完成之间没有插件可观察的严格同步信号。若 URL 一离开 UI 就立刻删除，可能出现：

```text
GC 删除旧 URL
  → service worker 的异步 cache.put 稍后完成
  → 已离开的 URL 再次出现于缓存
```

因此需要：

- URL 离开活跃状态后进入短暂宽限集合；
- 宽限结束后执行一次清理；
- 再安排一次较晚的补偿清理；
- 保留周期扫描作为最终收敛机制。

宽限期也让用户快速前后切换时继续命中缓存。它不是长期 MRU（Most Recently Used，最近使用）缓存；第一版默认不额外长期保留最近图片。

---

## 8. 稳态 GC

### 8.1 触发时机

- WebView 主体启动后；
- 活跃 URL 集合缩小时，debounce 后；
- 大图切换、灯箱状态变化并经过释放宽限期后；
- 灯箱关闭后；
- 周期性 idle 扫描；
- `pagehide` 时 best effort；
- 常规 GC 后检查到存储高水位时执行熔断。

避免每次 scroll 或每个 React render 都扫描 CacheStorage。

### 8.2 单实例执行

GC 使用同源 Web Lock：

```text
image-viewer-resource-cache-gc
```

采用 `ifAvailable` 或等价的非排队策略：已有面板正在清理时，其余面板跳过本轮，避免大型缓存上并发枚举。

### 8.3 版本无关的 cache 治理

正常运行时：

1. 枚举所有匹配 `vscode-resource-cache-<number>` 的名称；
2. 不判断哪个版本是当前版本，也不猜测“最大数字就是当前版本”；
3. 对每个匹配版本都执行图片条目级清理，只删除可确认的非活跃图片；
4. 整个 cache 只在首次历史迁移、最后面板关闭和高水位熔断时删除。

`swVersion` 是宿主用来更新 WebView service worker 的内部版本，不是扩展版本，
也不是本插件需要升级或降级的 schema。宿主源码要求外层期望版本与 worker
内部 `VERSION` 保持同步，但宿主分发和分支实现仍可能出现不一致。本方案因此刻意
不依赖 `swVersion` 选择 cache：无论用户留下 cache-4、cache-5、cache-6 还是未来
cache-7，只要名称仍符合数字版本命名约定，都会被同一套逻辑治理。

资源 URL 的 authority 同样从 worker `scriptURL` 的
`vscode-resource-base-authority` 参数取得，不硬编码 VS Code CDN 域名。这样可处理宿主降级、
Cursor/VS Code authority 差异和未来 worker 版本。若 authority 暂时不可用，条目级 GC
采用 fail-closed：本轮不删除 HTTPS 图片，后续周期扫描重新解析 worker；未知名称的 cache
始终不处理。

### 8.4 图片条目识别

不能删除当前 cache 中除活跃图片外的所有条目，因为其中还包含 WebView 的 JS、CSS、字体和 WASM。

第一版采用两层识别：

1. URL 形态：VS Code WebView 本地资源 URL，且路径扩展名属于插件支持的图片类型或网格缩略图输出类型；
2. 必要时读取已缓存 Response 的 `Content-Type` header，确认以 `image/` 开头。

不得调用 `response.blob()` 或读取响应体来计算体积，因为这会把大图重新读入内存。

兼容范围需要覆盖：

- 当前 `https://<scheme>+.vscode-resource.vscode-cdn.net/...`；
- 旧版 VS Code 可能使用的 WebView resource URL 形式；
- URL 编码路径、query 和大小写扩展名；
- 插件网格缩略图目录下的 `.jpg`/未来格式。

### 8.5 删除规则

对每个确认是图片的 request：

```text
request URL ∈ 所有有效租约 URL 的并集
  → 保留

request URL ∈ 未过期宽限集合
  → 保留

其他
  → cache.delete(request)
```

删除失败不会阻止其他条目继续处理。结束后记录结构化统计：

```text
cache 名称
扫描条目数
识别图片数
保留数
删除成功数
删除失败数
耗时
触发原因
```

默认不在用户界面持续显示日志；显式清理命令可以显示结果摘要。

---

## 9. 高水位熔断

条目级 GC 是主要机制。为防止租约、过滤器或宿主行为变化造成再次失控，增加独立熔断：

```text
navigator.storage.estimate()
```

它只能得到整个 origin 的近似 usage/quota，不能精确得到某个 cache 的大小。因此高水位是安全兜底，不是精确配额。

当前实现采用保守熔断：每轮条目级 GC 后，仅当所有有效租约都没有活跃/宽限 URL，且 origin 的估算 usage 超过 2GiB 时，删除全部 `vscode-resource-cache-*`。这样不会因为单张正在显示的超大图片反复清空并重写 cache；最后一个面板正常关闭时也会在确认没有其他有效面板租约后执行同样的全量清理。

阈值不能在未测量前定稿。需要验证：

- `storage.estimate()` 在 VS Code/Cursor WebView 中是否包含 CacheStorage 且更新及时；
- 删除 40GB cache 后 usage 下降的延迟；
- 当前 origin 的正常 JS/CSS/WASM 基线；
- 单张超大图片对 usage 的影响。

初步目标是把硬高水位控制在低个位数 GB 以内，而不是允许几十 GB。最终数值由 PoC 和真实图库验证决定，并记录在实现文档中。

---

## 10. 正确性与容量不变量

正常路径下应满足以下不变量：

### 10.1 历史不变量

```text
不存在无人使用且无限期保留的旧 service worker cache 版本。
```

### 10.2 稳态不变量

当图片加载停止并经过宽限期与补偿扫描后：

```text
当前 resource cache 内的图片条目
⊆ 所有有效面板租约的活跃 URL 并集
```

### 10.3 故障收敛不变量

崩溃可能留下有限残留，但下一次打开相同 origin 后：

```text
启动 GC 删除所有不属于新租约的历史图片。
```

### 10.4 无法承诺的硬上限

CacheStorage 没有逐条体积 API，宿主写入也发生在插件控制之外。因此不能承诺任意时刻严格不超过某个精确字节数。可以承诺的是：

- 正常使用不随浏览历史无限增长；
- 静置后收敛到活跃集合；
- 高水位异常时整体熔断；
- 单张当前大图本身仍可能很大。

---

## 11. 安全与兼容性

### 11.1 只清理本 origin

CacheStorage API 天然受 same-origin 限制。插件只能看到当前 WebView origin 的 cache，不能删除其他扩展 origin 的缓存。

### 11.2 只清理明确命名空间

只处理 `vscode-resource-cache-<number>`。未知 cache 名称一律保留。

### 11.3 Fail-open

缓存治理失败时继续显示图片。该功能是磁盘治理，不得成为图片查看的单点故障。

### 11.4 宿主兼容

实现不读取 Cursor/VS Code 的产品路径，不依赖 macOS 目录结构。Cursor、VS Code 与兼容发行版通过各自 WebView origin 自动隔离。

### 11.5 多窗口

不同 VS Code 窗口是否共享同一 Chromium storage partition 需在 PoC 中验证。租约协议必须允许另一个窗口的租约不可见时仍保持正确性：最坏结果应是额外重读，不得导致图片内容错误或 WebView 崩溃。

---

## 12. 代码结构建议

实际模块：

```text
src/webview/resourceCache/
  cacheModel.ts           # cache 名称、版本和图片 request 识别纯函数
  cacheModel.test.ts      # 名称、URL 和 Content-Type 安全边界
  leaseStore.ts           # panel lease、心跳、TTL、活跃并集
  leaseStore.test.ts      # 多面板并集、TTL 和独立释放
  resourceCacheManager.ts # 迁移、锁、租约、GC、熔断和关闭清理
  ResourceCacheBoundary.tsx # React context、后台初始化和显式命令入口
```

接入点：

| 区域 | 文件 | 预计改动 |
|---|---|---|
| 图库根组件 | `src/webview/PreviewImages/index.tsx` | 启动迁移、登记当前大图、灯箱关闭时释放 |
| 网格图片 | `src/webview/PreviewImages/ImageLazyLoad/index.tsx` | 实际 `src` 挂载/卸载时 retain/release |
| 缩略图预算 | `src/webview/PreviewImages/thumbLoadBudget.tsx` | 评估是否复用现有 registry 的持有状态，避免双重状态源 |
| 单图编辑器 | `src/webview/SingleImageViewer.tsx` | 启动迁移、当前 index 租约、关闭前 best effort |
| 扩展命令 | `src/constants/index.ts`、`src/extension.ts` 或 panel controller | 注册显式清理命令 |
| 配置/贡献 | `package.json` | 命令声明；第一版不暴露未经验证的阈值配置 |
| 文档 | `README.md`、`README.zh-CN.md`、本文件 | 用户说明与维护设计 |

实现时优先让 CacheStorage 逻辑与 React 解耦，便于测试纯函数、模拟 cache 和后续替换 UI 框架。

---

## 13. 实施阶段

### 阶段 A：PoC 与证据补齐（部分完成）

`.vscode/launch.json` 中的 `Run Extension (separate user data; WebStorage may be shared)`
启动项会传入单独的 `.vscode-test/cache-user-data` 与 `.vscode-test/cache-extensions`。
但在 macOS VS Code 1.138.0 的实测中，Extension Development Host 的 WebView 仍复用了
常规 VS Code profile 中已经持久化的 WebView origin 和 CacheStorage；因此该启动项只能隔离
普通 user data，**不能视为 CacheStorage 安全沙箱**。验证清理逻辑前仍应先确认 origin 和磁盘路径。

验证：

1. WebView 内能列出 `vscode-resource-cache-*`；
2. 重启后相同 `viewType` 回到相同 origin；
3. `caches.delete(name)` 能删除旧版本 cache；
4. 删除当前 cache 后页面已加载 bundle 仍可继续运行；
5. `cache.keys()`、`cache.delete(request)` 对跨源 resource URL 有效；
6. `navigator.locks`、`localStorage`、`navigator.storage.estimate()` 在 VS Code/Cursor 中可用；
7. `img.onload` 后 service worker 的 `cache.put` 延迟范围；
8. 多面板是否可见同一租约和 CacheStorage；
9. 关闭、Reload Window、正常退出、强制退出后的残留行为；
10. Remote SSH/Dev Container 至少做兼容性检查，不假设本地文件路径。

### 阶段 B：历史迁移（代码已完成）

1. 实现 cache 名称识别和迁移锁；
2. 图库挂载后在后台执行全量 resource cache 删除；
3. 单图编辑器挂载后在后台执行其 origin 的迁移；
4. 增加显式清理命令；
5. 增加迁移状态和失败重试；
6. 验证真实历史 cache 的条目数减少，不读取响应体。

### 阶段 C：稳态 GC（代码已完成）

1. 实现 panel lease 和 TTL；
2. 接入网格实际 src 生命周期；
3. 接入大图/单图当前 src；
4. 实现宽限期、补偿扫描和周期扫描；
5. 对所有数字版本的 service worker cache 执行版本无关的条目级治理；
6. 验证多面板并发。

### 阶段 D：熔断与产品化（代码完成，真实宿主验证待完成）

1. 根据 PoC 确定高水位；
2. 加入 `storage.estimate()` 熔断；
3. 完善诊断统计与用户提示；
4. 更新 README、CHANGELOG 和手动清理说明；
5. 用真实大图库做持续翻图测试，观察 CacheStorage 是否收敛。

---

## 14. 测试计划

### 14.1 单元测试

- cache 名称解析、排序和未知名称保留；
- resource URL 图片类型识别；
- URL 编码、query、大小写扩展名；
- 租约 TTL 和多面板并集；
- 宽限集合到期；
- 迁移标识只有在全部成功后写入；
- cache 操作异常时 fail-open；
- GC 统计正确。

### 14.2 集成测试

- 构造 cache-4/cache-5/cache-6，迁移后全部删除；
- 当前 cache 中混合 JS、CSS、WASM、图片，只删除非活跃图片；
- 两个图库面板分别显示不同图片，两者都被保留；
- 面板 A 关闭后只回收 A 独占图片；
- 大图快速前后切换不产生永久残留；
- 网格长距离滚动后缓存条目数量回落；
- Reload Window 后启动 GC 清理残留；
- 模拟 `cache.put` 晚于首次删除，补偿扫描最终清理；
- 高水位触发整体熔断。

### 14.3 回归验证

- 图库首次打开、刷新、搜索、文件夹折叠、滚动；
- 大图打开、前后切换、关闭；
- 单图编辑器左右切换、关闭；
- 多目录并列面板；
- 缩略图 globalStorage 500MB janitor 不受影响；
- JS/CSS/WASM 加载不因 GC 失效；
- CacheStorage API 不可用时仍能看图。

### 14.4 已完成验证（2026-10-13）

- `yarn test:resource-cache`：3 个 suite、11 个测试全部通过；
- `yarn check-type`：通过；
- `yarn compile`：扩展端 webpack 编译通过；
- `yarn ui-build`：图库与单图两个 WebView entry 均成功生成；
- 定向 ESLint：0 error；保留 `ImageLazyLoad` 中 5 个既有 warning；
- 项目级 `yarn lint`：仍被 `vscodeTheme.ts` 与 `thumbGridCache.ts` 中 16 个既有
  `no-unused-vars` error 阻塞；本次缓存治理相关文件没有新增 lint error；
- `git diff --check`：通过；
- Extension Development Host：图库成功加载 24,286 条图片索引，UI 未被后台迁移阻塞；
- Extension Development Host：单图编辑器使用独立 WebView origin，原图显示和同目录导航正常；
- 真实 VS Code origin 映射核对：图库 `PreviewImages` 对应 `WebStorage/7`，单图编辑器
  `vscode-infra.imageViewer` 对应 `WebStorage/14`；
- 本次启动迁移后，上述两个 origin 都从历史缓存状态收敛为约 4KB，只剩 174 字节
  `CacheStorage/index.txt`，没有 `vscode-resource-cache-*` 数据目录；整个 VS Code
  `WebStorage` 当前约 124MB，其余空间属于 GitLens、Go、内置图片预览等其他 origin。

- Cursor 发布版 `2.0.6` 上覆盖安装本地构建的 `2.0.7` VSIX，Reload Window 后正常运行
  **View Images**，没有从 Finder 或 shell 直接删除 CacheStorage；
- Cursor 图库恢复了原有 `origin=b2e3c366-...`，扩展通过页面内 CacheStorage API 将
  `WebStorage/11` 从约 41GB 先降到 6.3GB，并在约 15 秒后降到约 4KB；Cursor 整体
  `WebStorage` 从约 42GB 降到约 1.5GB，剩余空间属于其他 WebView origin；
- Cursor 单图编辑器打开测试图片后，当前 `origin=f2d112eb-...` 对应的 `WebStorage/17`
  从约 176MB 降到约 12KB；历史 `WebStorage/16` 仍有约 2.1MB，它属于当前页面不可达的
  旧 encoded origin，验证了扩展无法跨 origin 清理孤立 CacheStorage 的边界。

本次验证已经真实清理 VS Code 与 Cursor 的可达历史 Image Viewer CacheStorage，并确认
41GB 量级缓存能在后台完成删除和磁盘回收。未验证项主要剩下多窗口竞争、强制退出后的收敛，
以及宿主在何种升级场景会重新生成 encoded storage origin。

---

## 15. 发布与用户迁移

发布说明应明确：

1. 新版本会在下一次打开图库/单图编辑器时清理该类型当前可达 WebView origin 的历史资源缓存；
2. 大型历史缓存的磁盘空间回收可能由 Chromium 延迟完成；
3. 升级后完全不再使用插件的用户，应退出宿主后按文档手动清理；
4. 不建议用户在 Cursor/VS Code 运行时直接删除 CacheStorage 目录；
5. 插件自己的缩略图缓存仍存在，继续受原有约 500MB 上限管理。

手动删除只作为自动迁移失败、升级后不再打开插件，或宿主留下不可达孤立 origin 时的兜底。

---

## 16. 未来备选方案

如果 CacheStorage 内部机制频繁变化，或产品未来要求“完整原图绝不写入宿主 CacheStorage”，可另行评估扩展侧 loopback HTTP 流服务：

```text
<img>
  → localhost / forwarded endpoint
  → extension fs stream
  → Cache-Control: no-store
  → optional Range support
```

优点：保留 `<img>` 流式加载，不经过 `vscode-resource-cache`。

代价：新增端口、鉴权 token、CSP、Remote SSH/Dev Container/Codespaces 转发、服务生命周期和攻击面。VS Code 官方建议优先使用消息通道，只有不能满足需求时才采用 localhost forwarding。因此本设计不把该方案作为第一阶段实现。

参考：<https://code.visualstudio.com/api/advanced-topics/remote-extensions>

---

## 17. 实施前待确认项

以下项目仍需由 Extension Development Host 和真实样本验证：

1. `navigator.storage.estimate()` 的准确性和刷新延迟；
2. 当前 10 秒心跳、5 分钟 TTL、30 秒宽限期和 60 秒周期扫描是否需要调整；
3. 当前与最低支持 VS Code 版本的 CacheStorage/Web Locks 兼容性；
4. 多 VS Code 窗口是否共享同一个 storage partition；
5. 宿主在何种升级或迁移场景下会重新生成 encoded storage origin；
6. 显式清理命令的 UI 和是否自动关闭临时面板；
7. 是否需要向用户展示首次历史迁移进度。

这些待确认项不改变总体架构：历史迁移负责清旧账，租约 GC 负责阻止未来按浏览历史无限增长，高水位负责异常熔断。
