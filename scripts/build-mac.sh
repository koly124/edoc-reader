#!/usr/bin/env bash
set -euo pipefail

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "This script must run on macOS."
  exit 1
fi

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "Installing dependencies..."
npm ci

echo "Building macOS DMG..."
node scripts/detach-stale-dmg-volumes.js
npm run dist:mac

echo ""
echo "Done. Output:"
if ! ls -lh packages/viewer/release/*.dmg 2>/dev/null; then
  echo "ERROR: No .dmg was produced in packages/viewer/release/"
  exit 1
fi
