const fs = require("fs");
const path = require("path");

const srcDir = path.join(__dirname, "..", "src");
const distDir = path.join(__dirname, "..", "dist");

for (const file of fs.readdirSync(srcDir)) {
  if (file.endsWith(".js")) {
    fs.copyFileSync(path.join(srcDir, file), path.join(distDir, file));
  }
}
