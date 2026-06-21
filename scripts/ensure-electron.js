#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const { spawnSync, execSync } = require("child_process");

const root = path.join(__dirname, "..");

function parseNodeVersion() {
  const match = process.versions.node.match(/^(\d+)\.(\d+)\.(\d+)/);
  if (!match) return null;
  return { major: +match[1], minor: +match[2], patch: +match[3] };
}

function hasBrokenExtractZip() {
  const v = parseNodeVersion();
  if (!v) return false;
  if (v.major === 24 && v.minor >= 16) return true;
  if (v.major >= 26) return true;
  return false;
}

function findElectronDir() {
  const candidates = [
    path.join(root, "node_modules", "electron"),
    path.join(root, "packages", "viewer", "node_modules", "electron"),
  ];
  return candidates.find((dir) => fs.existsSync(path.join(dir, "package.json")));
}

function getElectronArch() {
  let arch = process.env.npm_config_arch || process.arch;
  if (
    process.platform === "darwin" &&
    arch === "x64" &&
    process.env.npm_config_arch === undefined
  ) {
    try {
      const output = execSync("sysctl -in sysctl.proc_translated", { encoding: "utf8" });
      if (output.trim() === "1") arch = "arm64";
    } catch {
      // ignore
    }
  }
  return arch;
}

function getPlatformPath(platform = process.platform) {
  switch (platform) {
    case "mas":
    case "darwin":
      return "Electron.app/Contents/MacOS/Electron";
    case "freebsd":
    case "openbsd":
    case "linux":
      return "electron";
    case "win32":
      return "electron.exe";
    default:
      throw new Error(`Electron builds are not available on platform: ${platform}`);
  }
}

function isElectronInstalled(electronDir) {
  const pathFile = path.join(electronDir, "path.txt");
  if (!fs.existsSync(pathFile)) return false;

  const { version } = require(path.join(electronDir, "package.json"));
  const platformPath = getPlatformPath();

  try {
    if (
      fs.readFileSync(path.join(electronDir, "dist", "version"), "utf8").replace(/^v/, "") !==
      version
    ) {
      return false;
    }
    if (fs.readFileSync(pathFile, "utf8") !== platformPath) {
      return false;
    }
  } catch {
    return false;
  }

  const electronPath = path.join(electronDir, "dist", platformPath);
  return fs.existsSync(electronPath);
}

function runInstallScript(electronDir) {
  const env = { ...process.env };
  delete env.ELECTRON_SKIP_BINARY_DOWNLOAD;

  return spawnSync(process.execPath, [path.join(electronDir, "install.js")], {
    cwd: electronDir,
    stdio: "inherit",
    env,
  });
}

async function installWithSystemUnzip(electronDir) {
  const electronPkg = require(path.join(electronDir, "package.json"));
  const { downloadArtifact } = require("@electron/get");
  const platform = process.env.npm_config_platform || process.platform;
  const arch = getElectronArch();

  console.log(
    `Downloading Electron ${electronPkg.version} for ${platform}-${arch} (unzip fallback)...`
  );

  const zipPath = await downloadArtifact({
    version: electronPkg.version,
    artifactName: "electron",
    platform,
    arch,
  });

  const distDir = path.join(electronDir, "dist");
  fs.rmSync(distDir, { recursive: true, force: true });
  fs.mkdirSync(distDir, { recursive: true });

  if (platform === "win32") {
    const result = spawnSync("tar", ["-xf", zipPath, "-C", distDir], { stdio: "inherit" });
    if ((result.status ?? 1) !== 0) {
      throw new Error("tar failed to extract Electron zip on Windows");
    }
  } else {
    const result = spawnSync("unzip", ["-q", "-o", zipPath, "-d", distDir], { stdio: "inherit" });
    if ((result.status ?? 1) !== 0) {
      throw new Error("unzip failed — install Xcode Command Line Tools: xcode-select --install");
    }
  }

  const srcTypeDefPath = path.join(distDir, "electron.d.ts");
  const targetTypeDefPath = path.join(electronDir, "electron.d.ts");
  if (fs.existsSync(srcTypeDefPath)) {
    fs.renameSync(srcTypeDefPath, targetTypeDefPath);
  }

  const platformPath = getPlatformPath(platform);
  fs.writeFileSync(path.join(electronDir, "path.txt"), platformPath);
}

function printHelp() {
  const v = process.versions.node;
  console.error("");
  console.error("Electron install failed.");
  console.error("");
  if (hasBrokenExtractZip()) {
    console.error(`Node.js ${v} has a known bug with Electron's default installer (Node 24.16+).`);
    console.error("Use Node.js 22 LTS instead:");
    console.error("  nvm install 22");
    console.error("  nvm use 22");
    console.error("  rm -rf node_modules packages/*/node_modules");
    console.error("  npm ci");
    console.error("");
  }
  console.error("Or retry manually from the repo root:");
  console.error("  node scripts/ensure-electron.js");
  console.error("");
}

async function main() {
  const electronDir = findElectronDir();
  if (!electronDir) {
    console.error("electron package not found — run npm install from the repo root.");
    process.exit(1);
  }

  if (isElectronInstalled(electronDir)) {
    return;
  }

  if (hasBrokenExtractZip()) {
    console.log(
      `Node.js ${process.versions.node} breaks Electron's default zip extractor — using unzip fallback...`
    );
    try {
      await installWithSystemUnzip(electronDir);
    } catch (err) {
      console.error(err instanceof Error ? err.message : err);
      printHelp();
      process.exit(1);
    }
  } else {
    console.log("Electron binary missing — downloading now (one-time, ~100 MB)...");
    const result = runInstallScript(electronDir);
    if ((result.status ?? 1) !== 0) {
      printHelp();
      process.exit(result.status ?? 1);
    }

    if (!isElectronInstalled(electronDir)) {
      console.log("Default installer did not finish — trying unzip fallback...");
      try {
        await installWithSystemUnzip(electronDir);
      } catch (err) {
        console.error(err instanceof Error ? err.message : err);
        printHelp();
        process.exit(1);
      }
    }
  }

  if (!isElectronInstalled(electronDir)) {
    console.error("Electron still not installed.");
    printHelp();
    process.exit(1);
  }

  console.log("Electron installed successfully.");
}

main().catch((err) => {
  console.error(err);
  printHelp();
  process.exit(1);
});
