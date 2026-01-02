#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SRC_PNG="${ROOT_DIR}/build/icon.png"
OUT_ICNS="${ROOT_DIR}/build/icon.icns"
ICONSET_DIR="${ROOT_DIR}/build/icon.iconset"

if [[ ! -f "${SRC_PNG}" ]]; then
  echo "❌ Missing ${SRC_PNG}"
  echo "请把你要用作图标的 PNG 放到：build/icon.png"
  echo "建议尺寸：1024x1024（或至少 512x512），背景透明或白底都可以。"
  exit 1
fi

rm -rf "${ICONSET_DIR}"
mkdir -p "${ICONSET_DIR}"

# macOS iconset sizes
declare -a sizes=(16 32 64 128 256 512 1024)

for s in "${sizes[@]}"; do
  # 1x
  sips -z "${s}" "${s}" "${SRC_PNG}" --out "${ICONSET_DIR}/icon_${s}x${s}.png" >/dev/null
done

# 2x variants (except 1024@2x which would be 2048; not needed)
sips -z 32 32 "${SRC_PNG}" --out "${ICONSET_DIR}/icon_16x16@2x.png" >/dev/null
sips -z 64 64 "${SRC_PNG}" --out "${ICONSET_DIR}/icon_32x32@2x.png" >/dev/null
sips -z 256 256 "${SRC_PNG}" --out "${ICONSET_DIR}/icon_128x128@2x.png" >/dev/null
sips -z 512 512 "${SRC_PNG}" --out "${ICONSET_DIR}/icon_256x256@2x.png" >/dev/null
sips -z 1024 1024 "${SRC_PNG}" --out "${ICONSET_DIR}/icon_512x512@2x.png" >/dev/null

iconutil -c icns "${ICONSET_DIR}" -o "${OUT_ICNS}"
rm -rf "${ICONSET_DIR}"

echo "✅ Generated ${OUT_ICNS}"

