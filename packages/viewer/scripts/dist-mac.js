const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const viewerDir = path.join(__dirname, "..");
const rootDir = path.join(viewerDir, "..", "..");
const releaseDir = path.join(viewerDir, "release");

function builderEnv() {
  const env = { ...process.env };
  delete env.GH_TOKEN;
  delete env.GITHUB_TOKEN;
  env.CSC_IDENTITY_AUTO_DISCOVERY = "false";
  env.EDOC_MAC_BUILD = "1";
  return env;
}

function run(command, args = [], options = {}) {
  const result = spawnSync(command, args, {
    stdio: "inherit",
    shell: true,
    env: builderEnv(),
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

npmRun("clean:release", viewerDir);
npmRun("build", viewerDir);
npmRun("prepare:dist", viewerDir);

run("node", [path.join(rootDir, "scripts", "detach-stale-dmg-volumes.js")], { cwd: rootDir });

const builderArgs = [
  "electron-builder",
  "--projectDir",
  "packages/viewer",
  "--mac",
  "dmg",
  "--publish",
  "never",
];

const useUniversal = process.env.EDOC_MAC_UNIVERSAL !== "0";
if (useUniversal) {
  builderArgs.push("--universal");
  console.log("Building universal DMG (arm64 + x64). Set EDOC_MAC_UNIVERSAL=0 for native arch only.");
} else {
  console.log("Building DMG for this Mac's CPU architecture only.");
}

run("npx", builderArgs, { cwd: rootDir });
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
