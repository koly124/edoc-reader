#!/usr/bin/env node
const { spawnSync } = require("child_process");
const path = require("path");

const root = path.join(__dirname, "..");

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: "inherit",
    shell: true,
  });
  process.exit(result.status ?? 1);
}

if (process.platform !== "darwin") {
  console.error("");
  console.error("Cannot build macOS app on", process.platform + ".");
  console.error("electron-builder only creates .dmg files on a Mac.");
  console.error("");
  console.error("From this Windows PC, use GitHub Actions instead:");
  console.error("  1. Push this repo to GitHub");
  console.error("  2. Actions -> Build macOS DMG -> Run workflow");
  console.error("  3. Download Edoc-Viewer-macOS artifact");
  console.error("");
  console.error("Local builds that work on Windows:");
  console.error("  npm run dist:win");
  console.error("  npm run dist:linux");
  console.error("");
  process.exit(1);
}

run("npm", ["run", "build", "-w", "@file-reader/shared"]);
run("npm", ["run", "dist:mac", "-w", "@file-reader/viewer"]);
