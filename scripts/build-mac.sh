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
npm run dist:mac

echo ""
echo "Done. Output:"
ls -lh packages/viewer/release/*.dmg
