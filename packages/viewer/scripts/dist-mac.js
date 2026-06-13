const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const viewerDir = path.join(__dirname, "..");
const releaseDir = path.join(viewerDir, "release");

function run(command, args = [], options = {}) {
  const result = spawnSync(command, args, {
    stdio: "inherit",
    shell: true,
    ...options,
  });
  if ((result.status ?? 1) !== 0) {
    process.exit(result.status ?? 1);
  }
}

function npmRun(script, cwd) {
  run("npm", ["run", script], { cwd });
}

function printUnsupportedPlatformHelp() {
  console.error("");
  console.error("macOS builds must run on a Mac. electron-builder cannot build .dmg on Windows or Linux.");
  console.error("");
  console.error("From Windows, use GitHub Actions:");
  console.error("  Actions -> Build macOS DMG -> Run workflow");
  console.error("");
}

function findDmgFiles() {
  if (!fs.existsSync(releaseDir)) {
    return [];
  }
  return fs.readdirSync(releaseDir).filter((name) => name.endsWith(".dmg"));
}

if (process.platform !== "darwin") {
  printUnsupportedPlatformHelp();
  process.exit(1);
}

process.env.EDOC_MAC_BUILD = "1";
process.env.CSC_IDENTITY_AUTO_DISCOVERY = "false";
delete process.env.GH_TOKEN;
delete process.env.GITHUB_TOKEN;

npmRun("clean:release", viewerDir);
npmRun("build", viewerDir);
npmRun("prepare:dist", viewerDir);
delete process.env.GH_TOKEN;
delete process.env.GITHUB_TOKEN;
run(
  "npx",
  [
    "electron-builder",
    "--mac",
    "dmg",
    "--universal",
    "--publish",
    "never",
  ],
  { cwd: viewerDir }
);
npmRun("trim:release", viewerDir);

const dmgFiles = findDmgFiles();
if (!dmgFiles.length) {
  console.error("macOS build finished but no .dmg was produced.");
  if (fs.existsSync(releaseDir)) {
    console.error("Release folder contents:", fs.readdirSync(releaseDir).join(", ") || "(empty)");
  }
  process.exit(1);
}

console.log("macOS release contains:", dmgFiles.join(", "));
