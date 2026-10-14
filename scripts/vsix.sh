#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
if [[ -s "$NVM_DIR/nvm.sh" ]]; then
  # shellcheck source=/dev/null
  . "$NVM_DIR/nvm.sh"
  if ! nvm use >/dev/null 2>&1; then
    nvm install
    nvm use
  fi
fi

major="$(node -p "parseInt(process.versions.node, 10)")"
if [[ "${major}" -lt 20 ]]; then
  echo "yarn vsix 需要 Node.js >= 20（当前 $(node -v)）。已安装 nvm 时请确保 ~/.zshrc 加载 nvm，或在仓库根目录执行: nvm use" >&2
  exit 1
fi

export IMAGE_VIEWER_VSIX_TARGET="$(node -e 'const p=require("./scripts/vsix-targets.cjs");process.stdout.write(p.validateTarget(process.env.IMAGE_VIEWER_VSIX_TARGET||p.hostTarget()))')"
for arg in "$@"; do
  case "$arg" in
    --target|-t|--target=*) echo "请用 IMAGE_VIEWER_VSIX_TARGET 指定平台，确保包内容与平台标识一致。" >&2; exit 1;;
  esac
done
output="$(node -p 'const p=require("./package.json");p.name+"-"+p.version+"-"+process.env.IMAGE_VIEWER_VSIX_TARGET+".vsix"')"
exec "$ROOT/node_modules/.bin/vsce" package --target "$IMAGE_VIEWER_VSIX_TARGET" --out "$output" "$@"
