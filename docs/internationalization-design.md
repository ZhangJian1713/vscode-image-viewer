# Image Viewer 国际化

## 用户行为

正式支持 English（`en`）、简体中文（`zh-CN`）、繁體中文（`zh-TW`）。用户级设置 `imageViewer.language` 的默认值为 `auto`，设置页 General → Language 的选项顺序固定为：跟随 VS Code、English、简体中文、繁體中文。语言名称使用本语言名称；“跟随 VS Code”及说明随当前界面翻译。

`auto` 每次按当前 `vscode.env.language` 解析，不读取 OS 或浏览器语言：英文及其他不支持语言使用 English；中文默认简体，`zh-Hans` 为简体，`zh-Hant` 为繁体，`zh-TW` / `zh-HK` / `zh-MO` 为繁体；显式 script 优先于 region。非法或缺失的偏好按 `auto` 处理。手选语言覆盖编辑器语言，切回 `auto` 立即按编辑器语言重新解析。

选择成功保存后立即更新所有存活的图库与单图 WebView，不要求刷新或关闭设置。语言使用 VS Code application scope 的用户配置，不混入各项目的 `projectsConfig`，不会覆盖图库布局、过滤、目录或主题偏好。保存失败保留已生效的语言和全部浏览状态，并在设置页显示本地化错误。设置保存期间仅禁用语言选择器，避免同一面板重复提交。

VS Code 原生命令标题和配置说明使用 `package.nls.json`、`package.nls.zh-cn.json`、`package.nls.zh-tw.json`，由宿主显示语言决定；插件内手选语言不会改写 VS Code 自身的语言。VS Code 自身语言切换需要重启，其跨重启状态恢复不属于此热切换契约。

## 模块与消息

- `src/i18n/language.ts`：纯语言模型、locale 解析与消息校验。
- `src/i18n/languageHost.ts`：读取/串行更新用户设置、监听外部设置修改、向存活 WebView 广播。图库面板和单图编辑器都按 panel 生命周期注册并释放订阅。
- `src/i18n/translator.ts`：复用已有 i18next，三份离线资源在初始化时全部内置；不引入远程翻译服务或新的依赖。
- `src/i18n/react.tsx`：每个 WebView 一个稳定的 i18next instance，React binding 订阅语言变化。初始化握手完成后才首次挂载业务组件，避免用错误语言闪现；此后语言变化不卸载组件树。同步更新 `<html lang/dir>`。
- `src/i18n/en.ts` 是界面 catalog 的 key 真源，另外两种语言以相同 key 类型约束；英文复数使用 i18next `count`，日期/数量按当前语言格式化。当前依赖版本使用类型化字符串 key，不使用新版本才支持的 selector API。
- `src/vendor/right-image-preview/locales/` 继续拥有独立、类型化的 Viewer 文案，新增繁体资源；通过公开 `language` prop 接入，不反向依赖扩展配置或图库代码。图库与单图入口共用这一 Viewer，单图 bundle 不加载 Ant Design。

语言消息独立于图库 GET_CONFIG / SAVE_CONFIG 与扫描消息：

| 消息 | 方向 | 数据 |
| --- | --- | --- |
| `getUiLanguage` | WebView → Host | 回调 `{ ok, snapshot }` |
| `setUiLanguage` | WebView → Host | `{ preference }`，白名单校验后写用户设置；回调 `{ ok, snapshot }` |
| `uiLanguageChanged` | Host → WebView | `{ preference, language, revision }` |

宿主串行处理来自不同面板的保存，失败不会阻断后续保存；每次广播递增 revision。前端先安装监听，再请求初始化；忽略旧 revision，避免迟到的初始化/保存回调覆盖更新的广播。新打开的面板直接读取最新设置。浏览器 Mock 使用独立开发偏好，支持 `hostLanguage` 参数，不触及真实用户配置。

## 状态保持不变量

语言更新只改变展示文案，不改变以下对象的身份或业务值：

- 扫描 request generation、图片快照、过滤结果、排序比较器及图片序列；排序标签翻译不得使实际排序随语言变化。
- 目录选择、展开、搜索、侧栏宽度与显隐、未应用的 Include/Exclude 草稿。
- 虚拟图库滚动容器、缩略图 Store、资源租约及缓存键。语言导致实际视口尺寸变化时，沿用现有图片锚点恢复机制。
- Preview session、当前 index、图片 DOM、缩放/平移/旋转/翻转/锁定状态；不得将语言用于 React key 或重建图片数组。
- 设置当前页签、打开状态和输入焦点；已打开的确认框、Toast 保留原回调、进行中状态及计时。

图库的初始化 Effect 依赖 refresh；因此翻译函数不得进入扫描/初始化的依赖链。扫描错误、导航提示和过滤校验保存结构化语义，在 render 时翻译，避免把旧语言字符串固定在 state 中。未知 OS/文件系统错误保留为“技术详情”，主要提示使用当前语言。

命令式 Ant Design 确认框和 Toast 使用存活的 `TranslatedText` 消费者作为内容，不通过销毁并重新弹出来换字。Ant Design 自带文案由 `ConfigProvider.locale` 同步切换。

单图启动参数在组件首次挂载时解析一次，语言 render 不重新生成 sibling 分组。单图编辑器设置 `retainContextWhenHidden: true`：在图库设置中切换语言时，隐藏的单图保留实例和缩放等临时状态，并接收广播。这会保留隐藏面板的运行上下文；关闭面板仍释放组件与资源，未新增跨关闭/重启的永久状态存储。

## 验证

- `yarn test:i18n`：语言解析、三语言 catalog key/插值/复数、用户保存与并发、多面板广播、迟到消息及保存失败、单图数据与资源身份、存活 Toast。
- `yarn test:gallery` 包含语言切换集成检查：真实图库/缩略图 Store/过滤草稿配合可控的 UI toolkit 验证滚动、目录、排序、预览数据及扫描/请求次数不变；另检查存活删除确认框。
- `yarn test:preview`：Viewer 热切换保留图片 DOM、缩放/平移/旋转/翻转/锁定等状态。
- TypeScript 和 WebView / Extension Host 编译检查消息接线与单图构建边界。

自动化使用 jsdom 和模拟宿主，不能代替真实 VS Code WebView 的焦点、原生弹层和各平台视觉验收；Windows/Linux/macOS 的真实编辑器验收需分别记录，不以构建或 jsdom 通过宣称已实测。
