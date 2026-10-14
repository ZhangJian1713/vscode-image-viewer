# README 演示视频

- `gallery-demo.mp4`：用户提供的桌面录屏，原始文件 `录屏2026-10-14 19.25.48.mov`；约 40.7 秒，由 3206×2190 / 60fps 转为 1600×1092 / 24fps、H.264 / yuv420p、无音轨、MP4 fast-start，约 5.2 MiB。
- `gallery-demo-poster.jpg`：录屏第 30 秒画面，使用 TinyJPG 从原始截图压缩，保留 1600×1092 分辨率，约 158 KiB，用于播放前封面。
- `gallery-demo-poster.webp`：同一原始截图生成的 WebP 版本，保留 1440×983、quality 82，约 128 KB，作为图床上的视频封面；优先保证复杂画面的清晰度，与六张 WebP 文档截图合计小于 400,000 字节。

中英文 README 的视频继续使用此公开仓库 `main` 分支的 GitHub Raw HTTPS 地址，封面则使用用户提供的腾讯云 COS 图床地址：`https://public-img-1253867148.cos.ap-singapore.myqcloud.com/img-in-docs/vscode-image-viewer/gallery-demo-poster.webp`。无需 GitHub Pages 或新建仓库。README 额外保留普通视频链接，供未显示内嵌播放器的页面使用。图片与封面已改用图床上的 WebP，视频继续由 GitHub 托管；市场页播放器的实际播放效果仍待扩展发布后验收。

`.vscodeignore` 排除整个 `assets/demos/`，文件由 GitHub 托管，不增加平台 VSIX 体积。更新录像时建议采用新的版本文件名，并同步 README，避免复用 URL 的旧缓存。

这是用户录制的本地测试演示。画面中的第三方壁纸素材尚未逐图核验授权，不能沿用 `assets/screenshots/CREDITS.md` 对另一组示例图片的许可结论。录像按用户指示公开用于功能演示；本记录不声明其中第三方素材可商用，后续更新宣传素材时应核验授权或改用已核验的示例图片。
