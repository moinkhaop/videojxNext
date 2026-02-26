#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
EXT_DIR="$ROOT_DIR/chrome-extension"

if [[ ! -d "$EXT_DIR" ]]; then
  echo "[ext-zip] chrome-extension/ not found, skipping."
  exit 0
fi

if ! command -v zip >/dev/null 2>&1; then
  echo "[ext-zip] zip command not available, skipping."
  exit 0
fi

VERSION="$(node -p "require('./chrome-extension/manifest.json').version" 2>/dev/null || echo "dev")"
NAME="videojx-extension-${VERSION}.zip"

DIST_DIR="$ROOT_DIR/dist"
PUBLIC_DIR="$ROOT_DIR/public/downloads"

mkdir -p "$DIST_DIR" "$PUBLIC_DIR"

OUT_DIST="$DIST_DIR/$NAME"
OUT_PUBLIC="$PUBLIC_DIR/$NAME"

echo "[ext-zip] Building $NAME"

# Zip extension contents so that manifest.json is at the zip root.
(
  cd "$EXT_DIR"
  rm -f "$OUT_DIST"
  zip -r "$OUT_DIST" . \
    -x "*.DS_Store" -x "*/.DS_Store" -x "__MACOSX/*" \
    -x "*.map" \
    >/dev/null
)

cp -f "$OUT_DIST" "$OUT_PUBLIC"
echo "[ext-zip] Output: $OUT_PUBLIC"

