#!/usr/bin/env bash
# Build the store-ready zip: runtime files only.
set -euo pipefail

cd "$(dirname "$0")/.."

node scripts/validate.js

VERSION="$(node -p "require('./manifest.json').version")"
ZIP="dist/page-pulse-extension-${VERSION}.zip"

mkdir -p dist
rm -f "$ZIP"

zip -r -X "$ZIP" \
  manifest.json \
  src \
  popup \
  options \
  icons \
  _locales \
  -x '*.DS_Store' >/dev/null

echo "built $ZIP ($(du -h "$ZIP" | cut -f1))"
unzip -l "$ZIP" | sed -n '1,200p'
