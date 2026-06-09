const { spawnSync } = require("child_process");
const path = require("path");

const viewerDir = path.join(__dirname, "..");
const builder = path.join(
  viewerDir,
  "..",
  "..",
  "node_modules",
  ".bin",
  process.platform === "win32" ? "electron-builder.cmd" : "electron-builder"
);

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
  console.error("Options:");
  console.error("");
  console.error("  1. Build on a Mac");
  console.error("     npm run dist:mac");
  console.error("");
  console.error("  2. Use GitHub Actions");
  console.error("     Push the repo, open Actions -> 'Build macOS DMG' -> Run workflow");
  console.error("     Then download the artifact from the Actions tab.");
  console.error("");
  console.error("  3. Use the multi-platform workflow");
  console.error("     Actions -> 'Build Edoc Viewer' also builds macOS on macos-latest.");
  console.error("");
}

if (process.platform !== "darwin") {
  printUnsupportedPlatformHelp();
  process.exit(1);
}

npmRun("clean:release", viewerDir);
npmRun("build", viewerDir);
npmRun("prepare:dist", viewerDir);
run(builder, ["--mac"], { cwd: viewerDir });
process.env.EDOC_MAC_BUILD = "1";
npmRun("trim:release", viewerDir);
