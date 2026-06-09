const fs = require("fs");
const path = require("path");

const pkg = require(path.join(__dirname, "..", "package.json"));
const releaseDir = path.join(__dirname, "..", "release");
const productName = pkg.productName ?? pkg.name;
const linuxFormat = process.env.EDOC_LINUX_FORMAT ?? "appimage";
const keep = new Set([
  `${productName}-${pkg.version}.exe`,
  `${productName}-${pkg.version}.dmg`,
  `${productName}-${pkg.version}.AppImage`,
  `${productName}-${pkg.version}.tar.gz`,
]);

if (linuxFormat === "tar.gz") {
  keep.delete(`${productName}-${pkg.version}.AppImage`);
} else if (linuxFormat === "appimage") {
  keep.delete(`${productName}-${pkg.version}.tar.gz`);
}

if (!fs.existsSync(releaseDir)) {
  return;
}

for (const entry of fs.readdirSync(releaseDir)) {
  if (keep.has(entry)) {
    continue;
  }

  fs.rmSync(path.join(releaseDir, entry), { recursive: true, force: true });
}

const kept = [...keep].filter((name) => fs.existsSync(path.join(releaseDir, name)));
if (kept.length) {
  console.log("Release contains:", kept.join(", "));
} else {
  console.warn("No final app artifact found in release/");
}
