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

# Actions injects GITHUB_TOKEN into every job. electron-builder treats it as a
# GitHub publish hint and crashes when it cannot resolve a publish config.
export GH_TOKEN=
export GITHUB_TOKEN=
unset GH_TOKEN GITHUB_TOKEN

cd "$ROOT"
npx electron-builder \
  --projectDir packages/viewer \
  --mac dmg \
  --publish never \
  -c.publish=null \
  -c.dmg.writeUpdateInfo=false

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
