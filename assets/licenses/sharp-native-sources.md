# Sharp native runtime

The extension bundles unmodified official Sharp 0.35.5 platform packages and
sharp-libvips 1.3.4 binaries (libvips 8.18.7), loaded as separate native modules.

- Sharp source and Apache-2.0 license: https://github.com/lovell/sharp/tree/v0.35.5
- Binary build scripts, dependency versions and patches:
  https://github.com/lovell/sharp-libvips/tree/v1.3.4
- libvips source: https://github.com/libvips/libvips/tree/v8.18.7
- Full LGPL-3.0 / GPL-3.0 terms accompany this file.

Each bundled package retains its original README, license and version metadata
under `dist/native/sharp-runtime/node_modules`. The libvips package README lists
its third-party libraries and their license terms; its `versions.json` identifies
the corresponding versions. The build scripts above identify their upstream
source archives and patches. The runtime manifest identifies the exact packages
included for this VSIX target.

The shared libraries remain separate files and can be replaced with compatible
builds. Neither Sharp nor its bundled native libraries have been modified.
