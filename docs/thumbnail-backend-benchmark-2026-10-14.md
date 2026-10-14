# ImageIO / Sharp 并发基准（2026-10-14）

## 结论

当前正式规格下，macOS 混合批次继续采用 ImageIO；Windows/Linux 替换为 Sharp 0.35.5。本机数据不能代替 Windows/Linux 性能实测。

- 在外层 4 并发时，ImageIO 相比每档表现最好的 Sharp 配置，吞吐约为 1.50～1.57 倍；峰值进程 RSS 更低。
- 从 1 提到 4 并发，ImageIO 的批次速度提升约 2.2～2.3 倍，CPU 时间 / wall time 也从约 1 提升到 2.3～2.4，确认使用了多个 CPU 核心。
- 将外层队列提高到 8 没有稳定收益：Extension Host 默认 libuv pool 仍为 4，不能把排队数当作实际工作线程数。
- 普通 JPEG 和这批 PNG 的差距很小；总体差距主要来自四张大 JPEG 与 LZW TIFF。不要解释为每张图片都固定快 1.5 倍。

## 环境与口径

- Apple M1 Max，10 logical CPUs，32 GiB RAM；Darwin 25.5.0，arm64；Node 22.22.3。
- ImageIO 为本项目 Objective-C / Node-API 8 模块；Sharp 0.35.5 / libvips 8.18.7。
- 12 个输入：4 张 DIV2K 照片 JPEG（约 2.7～3.8MP）；4 张开放许可的大 JPEG（约 44～47MP）；3 张由前三张 DIV2K JPEG 转换的 PNG；1 张 12756×3487、LZW TIFF。转换 PNG 属于格式变体，并非独立原生 PNG 样本。
- 原始样本取自本机 `/Users/zj/TestData/test-images/DIV2K_train_HR` 与 `/Users/zj/TestData/ultra-hd-open-license`；不复制或分发照片。原始结果只保存样本文件名和尺寸。
- 每个配置在独立 Node 子进程执行，预热一次，再测完整批次 3 轮，表格使用 wall time 中位数；各配置不并行运行。
- 源文件读取、解码、缩放、JPEG 编码和返回 Buffer 均包含；不包含缩略图写盘、VS Code IPC、浏览器图片解码和 UI。OS 文件页缓存未清空，因此不是严格的磁盘冷缓存测试。
- 两者都按比例缩小，不放大小图，应用 EXIF 方向，透明像素合成白色，输出 JPEG Q78。ImageIO 不缓存整图，Sharp operation cache 关闭。
- 固定 UV_THREADPOOL_SIZE=4，外层并发为 1/2/4/8；Sharp 单图内部线程另测 1/4/默认（本机 8）。测试覆盖 200/400/800px，共 48 个配置。

## 四任务并发的混合批次

Sharp 行选择同一档位、外层 4 并发中最快的内部线程配置。

| 长边 | ImageIO 批次 | Sharp 批次 | Sharp 内部线程 | ImageIO 吞吐优势 | ImageIO 峰值 RSS | Sharp 峰值 RSS |
|---|---:|---:|---:|---:|---:|---:|
| 200px | 585 ms | 920 ms | 4 | 1.57× | 153 MiB | 332 MiB |
| 400px | 608 ms | 913 ms | 8 | 1.50× | 155 MiB | 342 MiB |
| 800px | 637 ms | 966 ms | 8 | 1.52× | 169 MiB | 408 MiB |

## 400px 的并发扩展

为了观察调度能力，Sharp 此表固定单图内部线程 1；不选择每行最有利的不同配置。

| 后端 | 外层并发 | 批次中位 | 张/秒 | 平均使用核心数 | 峰值 RSS |
|---|---:|---:|---:|---:|---:|
| imageio | 1 | 1420 ms | 8.5 | 1.01 | 121 MiB |
| imageio | 2 | 928 ms | 12.9 | 1.55 | 139 MiB |
| imageio | 4 | 608 ms | 19.7 | 2.37 | 155 MiB |
| imageio | 8 | 658 ms | 18.2 | 2.23 | 148 MiB |
| sharp | 1 | 1925 ms | 6.2 | 1.00 | 234 MiB |
| sharp | 2 | 1317 ms | 9.1 | 1.48 | 268 MiB |
| sharp | 4 | 956 ms | 12.5 | 2.05 | 325 MiB |
| sharp | 8 | 1062 ms | 11.3 | 1.88 | 327 MiB |

## 格式与输出差异

400px、外层 1 并发（Sharp 内部线程 1），三轮逐格式累计耗时均值：

| 组 | ImageIO | Sharp |
|---|---:|---:|
| 4 张普通 JPEG | 134 ms | 131 ms |
| 4 张大 JPEG | 757 ms | 1001 ms |
| 3 张 PNG | 127 ms | 126 ms |
| 1 张 LZW TIFF | 400 ms | 663 ms |

**Q78 不是等画质标尺。** 400px 时平均 JPEG 输出：ImageIO 约 44.0 KiB，Sharp 约 24.1 KiB。两套编码器的 quality 参数、量化表和缩放滤镜并不相同；不能据此声称 ImageIO 在等画质下仍快这些倍数，也不能把 Sharp 更小的文件直接当成相同画质下更高效。此测试比较的是当前产品候选管线的固定参数规格。

峰值 RSS 是同一进程的总体采样（5ms 周期），包含原生库、线程与工作内存；不是每张图的独立内存预算。分支没有使用外部图像处理进程，所以不会漏掉 sips 子进程的内存。

## 实施与边界

- macOS 保留 ImageIO，跨面板最多 4 个生成任务。
- Windows/Linux 封装采用 Sharp 0.35.5；保持单图内部线程 1 和最多 4 个任务作为保守默认。尚无 Windows/Linux 数据，不宣称这是其最优配置。
- Sharp 独立 runtime 功能检查覆盖 JPEG/PNG/WebP/TIFF、EXIF、alpha、各档位、失败处理；真实 TS 适配器与缓存分支另有定向检查。
- Intel Mac、Windows 与 Linux 外国平台二进制只验证打包/版本/架构，未在本机执行。
- 最新 Sharp 要求 Node >=20.9，插件最低版本调整到 VS Code 1.92（内置 Node 20.14），与用户系统安装的 Node 无关。

## 复现

先 `yarn install && yarn native:build`，准备一个 JSON 数组，元素为同一组图片的绝对路径，然后执行：

```sh
yarn bench:thumbnail-backends --manifest=/absolute/path/manifest.json --report=/absolute/path/results.json
```

默认测试矩阵为三档尺寸 × 四档外层并发，以及 Sharp 的三档内部线程；输出逐配置进度。完整指标见 [原始 JSON](thumbnail-backend-benchmark-2026-10-14.json)。

依据：[Sharp 安装与平台包](https://sharp.pixelplumbing.com/install/)、[Sharp 并发](https://sharp.pixelplumbing.com/performance/)、[VS Code 1.92 的 Node 20.14](https://code.visualstudio.com/updates/v1_92#_electron-30-update)。
