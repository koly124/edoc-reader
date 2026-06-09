const fs = require("fs");
const path = require("path");

const releaseDir = path.join(__dirname, "..", "release");

if (!fs.existsSync(releaseDir)) {
  return;
}

for (const entry of fs.readdirSync(releaseDir)) {
  fs.rmSync(path.join(releaseDir, entry), { recursive: true, force: true });
}

console.log("Cleaned release folder");
