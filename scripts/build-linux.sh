#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "Installing dependencies..."
npm ci

echo "Building Linux AppImage..."
npm run dist:linux

echo ""
echo "Done. Output:"
ls -lh packages/viewer/release/*.AppImage
