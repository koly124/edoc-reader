#!/usr/bin/env bash
set -euxo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
VIEWER="$ROOT/packages/viewer"
RELEASE="$VIEWER/release"

cd "$ROOT"

export CSC_IDENTITY_AUTO_DISCOVERY=false
export EDOC_MAC_BUILD=1

npm run build -w @file-reader/shared

cd "$VIEWER"
npm run clean:release
npm run build
npm run prepare:dist

# GitHub Actions injects GITHUB_TOKEN into every job. electron-builder treats it
# as a GitHub publish hint and crashes when it cannot resolve a publish config.
# Do NOT pass -c.publish=null on the CLI: electron-builder parses that as the
# string "null" (a fake provider), not a null value. publish: null in
# electron-builder.yml is the correct way to disable publishing.
export GH_TOKEN=
export GITHUB_TOKEN=
unset GH_TOKEN GITHUB_TOKEN

cd "$ROOT"
npx electron-builder \
  --projectDir packages/viewer \
  --mac dmg \
  --universal \
  --publish never

echo "Release folder:"
ls -la "$RELEASE/" || true
find "$RELEASE" -maxdepth 2 -type f -print

if ! find "$RELEASE" -maxdepth 1 -name '*.dmg' | grep -q .; then
  echo "ERROR: No .dmg file was created."
  exit 1
fi

# Stable artifact name for upload (no spaces)
for dmg in "$RELEASE"/*.dmg; do
  cp "$dmg" "$RELEASE/Edoc-Viewer.dmg"
  echo "Prepared upload artifact: $RELEASE/Edoc-Viewer.dmg"
  break
done
