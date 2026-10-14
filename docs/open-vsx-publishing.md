# VS Code Marketplace 与 Open VSX 发布

## 两个市场的快捷命令

默认发布平台为 `darwin-arm64`、`darwin-x64`、`win32-x64`、`win32-arm64`。两个市场共用同一批 VSIX。

发布前将 `package.json`、公告版本 `ANNOUNCEMENT_ID` 与 CHANGELOG 更新到未发布的新版本，例如 `2.1.1`。已经发布的 `2.1.0` 不能用来覆盖新的源码或元数据。

发布前检查与打包（在 macOS 上执行）：

```bash
nvm use
yarn install --frozen-lockfile
yarn release:check
yarn vsix:release
yarn release:verify
```

然后选择发布入口：

| 命令 | 作用 |
| --- | --- |
| `yarn release:check` | 类型、TS/TSX ESLint，以及图库/筛选/主题、资源缓存、预览、发布脚本测试 |
| `yarn release:verify` | 打包后的宿主原生缩略图验证，加四平台包的离线发布演练；不重新构建、不上传 |
| `yarn publish:vscode` | 将四个平台包发布到 VS Code Marketplace |
| `yarn publish:openvsx` | 将四个平台包发布到 Open VSX |
| `yarn publish:all` | 使用同一批包，依次发布到两个市场 |
| `yarn release:all` | 一次执行代码检查、四平台打包、原生/包验证与两个市场发布 |
| `yarn publish:all --dry-run` | 离线检查包和发布计划，不读取凭据，不上传 |
| `yarn publish:check` | 只读查询两个市场的四个平台公开状态，不上传、不读取凭据 |

`release:check` 不构建、不联网、不上传。`vsix:release` 构建四个平台并逐包检查，最后恢复宿主生产构建；`release:verify` 使用这个构建实际验证宿主原生适配器，以及 ImageIO 或 Sharp 的尺寸档位、EXIF、透明图、异常输入和并发任务，再对四个包执行离线检查。macOS 上只能实际运行 ImageIO；Windows 包中的 Sharp 平台文件由包检查核对，不能替代 Windows 实机验证。

`publish:*` 直接上传已有文件，不构建、不修改版本、不执行 Git 操作。可在批量发布和状态命令后追加平台以缩小范围，例如 `yarn publish:vscode darwin-arm64`；`release:all` 固定检查、构建并发布默认四个平台，任何前置命令失败都停止后续步骤。

2026-10-14 添加统一检查入口后的执行记录：首次 `release:check` 在类型检查阶段拦下框架版本不匹配，当时安装/npm 最新版仍为 `@easy_vscode/core 2.0.1`，源码已引用新版 API。随后确认 3.0.0 于 2026-10-14 14:26 UTC 发布，项目依赖、锁文件和已安装模块均已对齐 3.0.0；所需 API 的实现与声明齐全，重跑类型、ESLint 和相关测试通过。反馈 URL 测试也已纳入统一检查。此前 `release:verify` 的宿主原生测试通过，离线检查拦下元数据过期的旧 2.1.0 包；新 2.1.1 包仍需重新构建后验证，不应复用旧包。

批量发布在任何上传之前检查全部包及所选市场的凭据，核对身份、版本、平台与原生后端，并拒绝简介/关键词/兼容要求过期的包。准备发布的源码或文档变化后仍需重新打包；不要同时构建和上传。已有版本只有确认 SHA-256 与本地相同时才会跳过，不同内容要求新版本号；部分发布失败后，已公开且校验一致的包可安全跳过。

上传成功不等于已经公开：Marketplace 验证与 Open VSX 扫描可能延迟数分钟。脚本对已接受但尚未公开的包显示“处理中”，继续其余平台；之后运行 `yarn publish:check`。状态命令在仍有平台未公开时退出码为 2，全部公开时为 0；上传错误为 1。不要为等待激活的包重复上传，等公开后再恢复部分失败的批次。

Marketplace 使用现有 `vsce login vscode-infra` 凭据（系统 Keychain 或 `~/.vsce`），也支持 `VSCE_PAT`；Open VSX 使用下方的 `.openvsx-token` 或 `OVSX_PAT`。缺少 Marketplace 凭据时先执行 `npx vsce login vscode-infra`。凭据不放在命令参数或日志中。

使用官方 `ovsx@1.1.1`（开发依赖，Node >=20），兼容项目 `.nvmrc` 的 Node 20。最新版 1.2.0 要求 Node >=22；发布工具的要求不影响用户运行插件。流程使用预先生成的 VSIX，不在上传时重新构建。

## 凭据

网页上传成功说明账号已完成发布协议和 namespace 设置，CLI 另外需要该账号的 Personal Access Token。

1. 登录 https://open-vsx.org/user-settings/tokens，生成 Token。
2. 将原始 Token 单独保存到项目根目录 `.openvsx-token`，不加变量名或引号；或使用环境变量 `OVSX_PAT`。
3. `.openvsx-token` 已同时从 Git 和 VSIX 排除，脚本读取后在 POSIX 系统限制文件权限为 0600。不要在聊天、Git、命令参数或日志里传递 Token。

Token 需要能发布到 `vscode-infra`。检查命令会调用官方 `verify-pat`，不会上传扩展。已有 namespace 无需重新创建。

## 打包、检查、发布

```bash
nvm use
yarn install
yarn vsix:all darwin-arm64 darwin-x64 win32-x64 win32-arm64
yarn openvsx:check image-viewer-2.1.0-darwin-arm64.vsix
yarn openvsx:publish image-viewer-2.1.0-darwin-arm64.vsix
```

默认发布按平台分包，完整矩阵在 macOS 构建：`darwin-arm64`、`darwin-x64`、`win32-x64`、`win32-arm64`、`linux-x64`、`linux-arm64`、`linux-armhf`、`alpine-x64`、`alpine-arm64`。每个包分别上传，相同 publisher/name/version 的不同目标属于同一个插件。`yarn vsix` 默认仅打包宿主平台；`yarn vsix:all` 一次构建 WebView，再串行构建/检查所有目标，并恢复宿主构建供 F5 使用。只做离线包检查可运行：

```bash
yarn openvsx:check image-viewer-2.1.0-darwin-arm64.vsix --offline
```

包检查核对身份、版本、VSIX 平台元数据、插件/WebView 入口、目标原生文件，并拒绝凭据文件及通用包。macOS 包必须只有 ImageIO 后端；其他平台包必须只有该目标的 Sharp/libvips 后端。打印 SHA-256 用于确认上传的是已检查的文件。单包在线检查另外查询同版本、同平台是否存在；发布前验证 Token 权限，拒绝重复覆盖，并在上传后核对线上版本。异步处理或查询暂不可用时明确提示已上传，之后用 `publish:check` 核对，不把公开延迟当作上传失败。

缺少 Token 时在线检查仍可完成公开版本查询，但权限检查未完成；发布命令会报错并停止。网络/上传结果不确定时先查询线上状态，不要盲目重试。线上核对失败不代表上传一定失败。

## 平台包

同一套上传命令也适用于带 TargetPlatform 的 VSIX，`ovsx` 读取包内平台标识，不需另传 `--target`：

```bash
IMAGE_VIEWER_VSIX_TARGET=win32-x64 yarn vsix --out image-viewer-2.1.0-win32-x64.vsix
yarn openvsx:check image-viewer-2.1.0-win32-x64.vsix
yarn openvsx:publish image-viewer-2.1.0-win32-x64.vsix
```

macOS 包不包含 Sharp；Windows/Linux 包不包含 ImageIO 和其他架构 Sharp。平台名称同时决定原生文件和 VSIX TargetPlatform，不能单独给一个现成通用包加平台标签。Windows/Linux 真实运行验证仍待完成。

微软 Marketplace 与 Open VSX 使用独立账号和发布流程，可以复用同一份已检查 VSIX。Cursor 使用自己的 Open VSX 市场代理，Open VSX 上传成功后仍需验证 Cursor 的可见性、安装和更新。

## 本次验证记录（2026-10-14）

- 官方 CLI 已实际查询到线上 `vscode-infra.image-viewer 2.0.6@universal`。
- 先前误生成的 `2.1.0@universal` 为 73.57 MiB，未上传；该包已退出发布流程，当前检查命令拒绝通用包。约 98% 压缩体积为多平台 Sharp/libvips，而 macOS 实际使用 ImageIO。
- 原通用包的 207 个原生/vendor 文件与构建源文件逐个 SHA-256 相同，生产运行时的 ImageIO / Sharp 适配器通过实际加载验证。后续平台包检查另外确认后端裁剪与平台标识一致。
- 9 个平台包已实际生成并完成离线检查，矩阵结束后恢复 macOS 宿主构建；包含错误后端、多个 Sharp 目标、缺少平台标识的测试包均被拒绝。
- 包含凭据文件、过期版本、缺少运行文件的模拟 VSIX 均被拒绝。
- Token 已由用户保存到本地；权限验证与真实上传待完成。中英文 README 已补入真实图片的单图查看器、默认编辑器入口和图片墙本地截图，素材来源与许可记录在 `assets/screenshots/CREDITS.md` 和 `SOURCES.json`。Blue Marble 使用 NASA 官方 8000×8000 原图（CC BY 2.0），图库其余 11 张使用已核对的 CC0 / NASA 公共领域素材。六张截图和视频封面已上传腾讯云 COS，两个 README 统一使用 WebP HTTPS 地址；七张图片已验证可访问并与本地最终版逐一核对，合计 396,404 字节。视频继续使用 GitHub Raw 地址。README 保留素材署名与许可文档入口。图片链接已就绪，发布前需用最新文档重新打包，不能上传仍包含旧 README 的既有 VSIX。Windows/Linux 实机运行与 Cursor 安装更新仍待验证。

前期九平台验证包的压缩大小（不是本次正式发布包）：

| TargetPlatform | MiB |
| --- | ---: |
| darwin-arm64 | 1.41 |
| darwin-x64 | 1.41 |
| win32-x64 | 9.87 |
| win32-arm64 | 9.22 |
| linux-x64 | 9.71 |
| linux-arm64 | 9.95 |
| linux-armhf | 8.54 |
| alpine-x64 | 9.70 |
| alpine-arm64 | 9.94 |

旧通用包的压缩体积分布：Sharp/libvips 约 72.1 MiB（9 份平台运行时，约 98%），文档截图约 0.86 MiB，WebView 约 0.44 MiB，ImageIO 桥接约 0.01 MiB，其余为插件代码、说明文件和 ZIP 元数据。旧包仅保留为 `image-viewer-2.1.0-universal-obsolete.vsix` 作诊断参考，禁止发布。

官方资料：[Open VSX CLI](https://github.com/eclipse-openvsx/openvsx/blob/main/cli/README.md)、[发布指南](https://github.com/eclipse-openvsx/openvsx/wiki/Publishing-Extensions)、[Cursor 扩展说明](https://prod.cursor.com/help/customization/extensions)。

## 2.1.0 正式发布（2026-10-14）

用户确认本次只发布 macOS 与 Windows，包含下列四个平台；不上传通用、Linux 或 Alpine 包。上述示例命令明确限定本次平台，省略平台参数仍会构建完整开发矩阵。

| TargetPlatform | MiB | SHA-256 |
| --- | ---: | --- |
| darwin-arm64 | 0.60 | `9bf6541c0f8d87702a72c4b59f182eb63615ae2f4490ee3985aa2a3c5d8f24e9` |
| darwin-x64 | 0.60 | `159cf4e16a91328cda3a10f2bda5624e90c7a3c2d364e92dc76dd1c63e397cee` |
| win32-x64 | 9.06 | `40a8055368c7602270bb427ab0b9584c0a7f813f8e9d84baa5cb446d286d7c6b` |
| win32-arm64 | 8.41 | `236261c46b111f033513f3865167315b602d8196a4e7f6a786e4f02028e6aa30` |

- 两个市场均验证现有凭据有 `vscode-infra` 发布权限；凭据只在工具内部使用，未输出到日志。
- 从最新工作区重建四个平台包，核对包内中英文 README 的 WebP 地址、GitHub 视频、2.1.0 分类公告和 CHANGELOG。截图文件不再进入 VSIX，保留素材署名与许可记录；演示视频仍排除。
- 包内 macOS ImageIO 的 Mach-O 包含 arm64/x86_64，实际加载并验证缩略图尺寸、EXIF、透明图、BMP/GIF/TIFF、异常输入、32 个异步任务和 Worker 加载。Windows 的 Sharp `.node` 与动态库 PE 架构分别核对为 x64/ARM64，保留原生许可证。Windows 与 Intel macOS 实机运行仍未验证。
- 图库、预览、缓存、筛选、主题相关测试通过；修正原生测试对 macOS 包仍包含 Sharp 的过期假设，并清理导航测试中的无用转义。类型检查与全源 ESLint 通过。
- Marketplace 官方 `vsce publish --packagePath` 返回四个平台全部发布成功；Open VSX 官方 `ovsx` 返回四个平台全部上传成功。
- 2026-10-14 13:27 UTC，Marketplace 与 Open VSX 公开 API 均已返回全部四个 `2.1.0` 平台版本。Open VSX 上传后异步激活，期间约数分钟返回 404；没有重复上传。核对 Open VSX 下载包 SHA-256 与本地一致，以及两个市场的平台 README 使用最新 WebP 与 GitHub 视频地址。播放器实际渲染、Cursor 市场代理同步和安装更新仍未做 GUI 验收。

## 2.1.1 正式发布（2026-10-14）

按用户授权执行 `yarn release:all`，只发布 macOS 与 Windows 的四个平台，两个市场复用同一批文件。

| TargetPlatform | MiB | SHA-256 |
| --- | ---: | --- |
| darwin-arm64 | 0.60 | `5fc5e1169fed762112a18ded776e72cd5fb82e83ce5a0fba6546dc5291dfba0c` |
| darwin-x64 | 0.60 | `02c5e0af554fa91f80bff0ea09e21adc9a26460e29139faf54e71c1450c14956` |
| win32-x64 | 9.06 | `0a210486c2d324adc2721ffc71bfb013b4b1d4f2437ec03082e13e9b21163e8c` |
| win32-arm64 | 8.41 | `cbfc1208945847fbb54f90d279b89801398ce3bfce6cc0e95e714f7dde4f6e01` |

- `release:check` 的类型、TS/TSX ESLint、图库/反馈/筛选/主题、资源缓存、预览和发布脚本测试全部通过；四平台构建与离线包检查通过。
- `release:verify` 实际运行恢复后的 macOS 生产构建：原生适配器及 ImageIO 尺寸档位、EXIF、透明图、BMP/GIF/TIFF、异常输入、32 个异步任务与 Worker 验证通过；四包离线发布演练通过。
- 包内版本、简介、关键词、兼容要求及依赖与当前项目一致，包含 `@easy_vscode/core 3.0.0`。实际后端 bundle 包含新的序列化、CSP nonce、面板资源与生命周期 API；WebView bundle 包含 Grid 默认值与 Grid → Fill → List 按钮顺序，以及 2.1.1 公告。中英文 README 布局顺序、13 个 WebP 地址引用、CHANGELOG 和各平台原生二进制架构核对通过。
- Marketplace 与 Open VSX 均已返回四个平台上传成功；2026-10-14 14:45:56 UTC，两市场公开 API 均提供全部四个 `2.1.1` 平台版本。没有重复上传。
- Marketplace 公开的四个 VSIX SHA-256 均与本地一致；Open VSX 四个下载包逐一校验 SHA-256 一致。两个市场四个平台的 README 均核对 Grid 优先、WebP 截图与 GitHub 视频；两市场的简介与全部 25 个关键词也已核对生效。
- 仍未做 Windows/Intel macOS 实机、Cursor 代理安装更新与市场页面视频播放器的 GUI 验收。
