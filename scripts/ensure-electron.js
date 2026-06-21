#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const root = path.join(__dirname, "..");

function findElectronDir() {
  const candidates = [
    path.join(root, "node_modules", "electron"),
    path.join(root, "packages", "viewer", "node_modules", "electron"),
  ];
  return candidates.find((dir) => fs.existsSync(path.join(dir, "package.json")));
}

function printHelp() {
  console.error("");
  console.error("Electron install failed. From the repo root, try:");
  console.error("  rm -rf node_modules packages/*/node_modules");
  console.error("  npm ci");
  console.error("  node node_modules/electron/install.js");
  console.error("");
  console.error("Use Node.js 20 or 22 LTS if problems persist (current:", process.version + ").");
  console.error("Do not use GitHub ZIP downloads without running npm ci afterward.");
  console.error("");
}

const electronDir = findElectronDir();
if (!electronDir) {
  console.error("electron package not found — run npm install from the repo root.");
  process.exit(1);
}

const pathFile = path.join(electronDir, "path.txt");
if (fs.existsSync(pathFile)) {
  process.exit(0);
}

console.log("Electron binary missing — downloading now (one-time, ~100 MB)...");

const result = spawnSync(process.execPath, [path.join(electronDir, "install.js")], {
  cwd: electronDir,
  stdio: "inherit",
});

if ((result.status ?? 1) !== 0) {
  printHelp();
  process.exit(result.status ?? 1);
}

if (!fs.existsSync(pathFile)) {
  console.error("Electron still not installed after install.js.");
  printHelp();
  process.exit(1);
}

console.log("Electron installed successfully.");
