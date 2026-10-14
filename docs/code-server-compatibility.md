# code-server compatibility

Image Viewer uses `@easy_vscode/webview` 2.0.2 to detect the injected
`acquireVsCodeApi` function instead of rejecting HTTP(S) origins. This restores
gallery host messaging in browser-hosted VS Code. The API is acquired once and
retained privately; standalone development pages without a host API keep the
existing no-op transport and can opt into their own mocks.

This is capability detection, not authentication. It adds no host commands and
does not relax browser security, resource access or host-side validation. The
extension still needs a Node.js extension host and a package matching the server
OS/architecture; this change does not add a browser-only vscode.dev extension.

WebView service workers require a secure browser context: HTTP localhost or
trusted HTTPS. HTTP access through a remote/LAN IP address may still prevent
WebViews from loading.

## Verification

Verified on 2026-10-14 with code-server 4.141.0 / VS Code 1.141.0 on macOS arm64,
using HTTP 127.0.0.1 and isolated test images. The Image Viewer 2.1.1 working build
originally stalled at 0 indexed images. With the published 2.0.2 dependency, the
production WebView build indexed four root/subfolder images, displayed
PNG/SVG/JPEG, loaded a 200×125 ImageIO thumbnail, and delivered the single-editor
close message to the host. The registry package matched the tested tarball
(SHA-1 `8cc75f1507b8107019447b91af62329f507f9145`).

Upstream bridge regression tests cover HTTP, HTTPS, desktop WebViews, absent or
invalid host APIs, contained acquisition failures and callback delivery. Consumer
type checks, targeted single-editor/gallery-navigation/scan tests and the
production WebView build passed. Linux/Sharp, remote HTTPS and reverse-proxy
subpaths remain unverified.

References: [VS Code WebView messaging](https://code.visualstudio.com/api/extension-guides/webview#passing-messages-from-a-webview-to-an-extension),
[code-server WebView requirements](https://coder.com/docs/code-server/FAQ#why-do-web-views-not-work).
