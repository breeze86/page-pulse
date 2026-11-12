#!/usr/bin/env bash
# Build outputs:
#   dist/                  unpacked extension of the current version (load-unpacked)
#   release/<name>.zip     store & GitHub Release asset
set -euo pipefail

cd "$(dirname "$0")/.."

node scripts/validate.js

VERSION="$(node -p "require('./manifest.json').version")"
NAME="page-pulse-extension-${VERSION}"
ZIP="release/${NAME}.zip"

# dist/ and release/ are fully generated, so a clean rebuild is safe.
rm -rf dist release
mkdir -p dist release

cp manifest.json dist/
cp -R src popup options icons _locales dist/
find dist -name '.DS_Store' -delete 2>/dev/null || true

ZIP_ABS="$(pwd)/${ZIP}"
(cd dist && zip -r -X "$ZIP_ABS" . -x '*.DS_Store' >/dev/null)

echo "unpacked : dist/ (manifest.json at dist/manifest.json)"
echo "version  : ${VERSION}"
echo "release  : ${ZIP} ($(du -h "$ZIP" | cut -f1))"
echo "load it  : chrome://extensions -> Load unpacked -> $(pwd)/dist"
echo
unzip -l "$ZIP" | tail -3
