#!/usr/bin/env bash
set -euxo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

export CSC_IDENTITY_AUTO_DISCOVERY=false
export EDOC_MAC_BUILD=1

npm run build -w @file-reader/shared

cd "$ROOT/packages/viewer"
npm run clean:release
npm run build
npm run prepare:dist

npx electron-builder --mac dmg --publish never

echo "Release folder:"
ls -la release/ || true
find release -maxdepth 2 -type f -print

if ! find release -maxdepth 1 -name '*.dmg' | grep -q .; then
  echo "ERROR: No .dmg file was created."
  exit 1
fi

# Stable artifact name for upload (no spaces)
for dmg in release/*.dmg; do
  cp "$dmg" "release/Edoc-Viewer.dmg"
  echo "Prepared upload artifact: release/Edoc-Viewer.dmg"
  break
done
