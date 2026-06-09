const { spawnSync } = require("child_process");
const fs = require("fs");
const os = require("os");
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

function canCreateSymlinks() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "edoc-symlink-"));
  const target = path.join(dir, "target.txt");
  const link = path.join(dir, "link.txt");

  try {
    fs.writeFileSync(target, "ok");
    fs.symlinkSync(target, link, "file");
    return true;
  } catch {
    return false;
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function wslAvailable() {
  const result = spawnSync("wsl.exe", ["-l", "-v"], { encoding: "utf8" });
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
  return result.status === 0 && !/not installed/i.test(output);
}

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

function chooseLinuxTarget() {
  if (process.platform !== "win32") {
    return { target: "AppImage", format: "appimage" };
  }

  if (wslAvailable()) {
    const root = path.join(__dirname, "..", "..", "..");
    const wslPath = root
      .replace(/\\/g, "/")
      .replace(/^([A-Za-z]):/, (_, drive) => `/mnt/${drive.toLowerCase()}`);

    console.log("Windows detected with WSL available. Building AppImage in Linux...");
    run("wsl.exe", ["bash", "-lc", `cd '${wslPath}' && bash scripts/build-linux.sh`]);
    process.exit(0);
  }

  if (!canCreateSymlinks()) {
    console.log("Windows cannot create AppImage symlinks. Building tar.gz instead.");
    console.log("On Linux, extract and run:");
    console.log("  tar -xzf 'Edoc Viewer-1.0.0.tar.gz'");
    console.log("  ./edoc-viewer/edoc-viewer");
    console.log("");
    return { target: "tar.gz", format: "tar.gz" };
  }

  return { target: "AppImage", format: "appimage" };
}

const { target, format } = chooseLinuxTarget();

process.env.EDOC_LINUX_FORMAT = format;

npmRun("clean:release", viewerDir);
npmRun("build", viewerDir);
npmRun("prepare:dist", viewerDir);
run(builder, ["--linux", target], { cwd: viewerDir });
npmRun("trim:release", viewerDir);
