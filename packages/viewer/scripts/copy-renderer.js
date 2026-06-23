const fs = require("fs");
const path = require("path");

const src = path.join(__dirname, "..", "src", "renderer");
const dest = path.join(__dirname, "..", "dist", "renderer");
const rootIcon = path.join(__dirname, "..", "..", "..", "ico.png");
const pdfWorker = require.resolve("pdfjs-dist/build/pdf.worker.mjs");

fs.mkdirSync(dest, { recursive: true });
for (const file of fs.readdirSync(src)) {
  if (file.endsWith(".html") || file.endsWith(".css") || file.endsWith(".png")) {
    fs.copyFileSync(path.join(src, file), path.join(dest, file));
  }
}

if (fs.existsSync(rootIcon)) {
  fs.copyFileSync(rootIcon, path.join(dest, "ico.png"));
}

fs.copyFileSync(pdfWorker, path.join(dest, "pdf.worker.mjs"));

const envSetupScript = path.join(__dirname, "..", "src", "checkserver.js");
if (fs.existsSync(envSetupScript)) {
  fs.copyFileSync(envSetupScript, path.join(__dirname, "..", "dist", "checkserver.js"));
}

const envRunnerScript = path.join(__dirname, "..", "src", "env-runner.js");
if (fs.existsSync(envRunnerScript)) {
  fs.copyFileSync(envRunnerScript, path.join(__dirname, "..", "dist", "env-runner.js"));
}
