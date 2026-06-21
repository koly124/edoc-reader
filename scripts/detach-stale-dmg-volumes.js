#!/usr/bin/env node
const { spawnSync } = require("child_process");
const fs = require("fs");

const VOLUME_PREFIXES = [
  "Edoc Viewer",
  "EdocViewer",
  "Edoc-Viewer",
];

function detachVolume(mountPoint) {
  if (!fs.existsSync(mountPoint)) {
    return;
  }

  console.log(`Detaching stale DMG volume: ${mountPoint}`);
  const result = spawnSync("hdiutil", ["detach", mountPoint, "-force"], {
    stdio: "inherit",
  });
  if ((result.status ?? 1) !== 0) {
    console.warn(`Could not detach ${mountPoint} — close Finder windows using it and retry.`);
  }
}

function listVolumesDir() {
  try {
    return fs.readdirSync("/Volumes");
  } catch {
    return [];
  }
}

if (process.platform !== "darwin") {
  process.exit(0);
}

for (const name of listVolumesDir()) {
  if (VOLUME_PREFIXES.some((prefix) => name === prefix || name.startsWith(`${prefix} `))) {
    detachVolume(`/Volumes/${name}`);
  }
}
