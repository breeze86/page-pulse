#!/usr/bin/env bash
# Build outputs:
#   dist/<name>/           unpacked extension (load-unpacked / local testing)
#   release/<name>.zip     store & GitHub Release asset
set -euo pipefail

cd "$(dirname "$0")/.."

node scripts/validate.js

VERSION="$(node -p "require('./manifest.json').version")"
NAME="page-pulse-extension-${VERSION}"
DIST="dist/${NAME}"
ZIP="release/${NAME}.zip"

# dist/ and release/ are fully generated, so a clean rebuild is safe.
rm -rf dist release
mkdir -p "$DIST" release
cp manifest.json "$DIST/"
cp -R src popup options icons _locales "$DIST/"
find "$DIST" -name '.DS_Store' -delete 2>/dev/null || true

ZIP_ABS="$(pwd)/${ZIP}"
(cd "$DIST" && zip -r -X "$ZIP_ABS" . -x '*.DS_Store' >/dev/null)

echo "unpacked : ${DIST}/"
echo "release  : ${ZIP} ($(du -h "$ZIP" | cut -f1))"
echo "load it  : chrome://extensions -> Load unpacked -> $(pwd)/${DIST}"
echo
unzip -l "$ZIP" | tail -3
