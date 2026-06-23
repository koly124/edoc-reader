import { createHash } from "crypto";
import { exec, spawn } from "child_process";
import { app, BrowserWindow, dialog, ipcMain, Menu, type IpcMainInvokeEvent } from "electron";
import { basename } from "path";
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, appendFileSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import {
  appConfig,
  decryptEdocFull,
  getEdocExpiryInfo,
  isLegacyEdoc,
  normalizeEdocFile,
  parseMasterKey,
  persistFirstOpen,
  type EdocFile,
  type EdocLegacyV1,
  type EdocMeta,
} from "@file-reader/shared";

let mainWindow: BrowserWindow | null = null;

app.setName("Edoc Viewer");

const masterKey = appConfig.viewer.masterKey
  ? parseMasterKey(appConfig.viewer.masterKey)
  : undefined;

const launchEdocPath = process.argv.find(
  (arg) => arg.endsWith(".edoc") && existsSync(arg)
);

export interface EdocFileRef {
  filePath: string;
  fileName: string;
}

function readEdocFile(filePath: string): EdocFile {
  const raw = readFileSync(filePath, "utf8");
  return normalizeEdocFile(JSON.parse(raw));
}

function sidecarPath(key: string): string {
  return join(app.getPath("userData"), "open-tracking", `${key}.json`);
}

function loadSidecarFirstOpened(key: string): string | undefined {
  const path = sidecarPath(key);
  if (!existsSync(path)) return undefined;
  try {
    const data = JSON.parse(readFileSync(path, "utf8")) as { firstOpenedAt?: string };
    return data.firstOpenedAt;
  } catch {
    return undefined;
  }
}

function saveSidecarFirstOpened(key: string, firstOpenedAt: string): void {
  const path = sidecarPath(key);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify({ firstOpenedAt }, null, 2), "utf8");
}

function trackingKey(edoc: EdocFile): string {
  if (isLegacyEdoc(edoc)) {
    return edoc.documentId;
  }
  return createHash("sha256")
    .update(edoc.kdfSalt + edoc.ciphertext)
    .digest("hex");
}

function mergeLegacyEnvelope(edoc: EdocLegacyV1, filePath: string): EdocLegacyV1 {
  if (!isLegacyEdoc(edoc) || edoc.firstOpenedAt) return edoc;

  const onDisk = readEdocFile(filePath);
  if (isLegacyEdoc(onDisk) && onDisk.firstOpenedAt) {
    return { ...edoc, firstOpenedAt: onDisk.firstOpenedAt };
  }

  const sidecar = loadSidecarFirstOpened(trackingKey(edoc));
  if (sidecar) {
    return { ...edoc, firstOpenedAt: sidecar };
  }

  return edoc;
}

function writeUpdatedEdoc(
  envelope: EdocFile,
  filePath: string,
  meta: EdocMeta
): void {
  writeFileSync(filePath, JSON.stringify(envelope, null, 2), "utf8");

  if (meta.firstOpenedAt) {
    saveSidecarFirstOpened(trackingKey(envelope), meta.firstOpenedAt);
  }
}

function toFileRef(filePath: string): EdocFileRef {
  return { filePath, fileName: basename(filePath) };
}

function envSetupLogPath(): string {
  return join(app.getPath("userData"), "env-setup.log");
}

function logEnvSetup(message: string): void {
  const line = `${new Date().toISOString()} ${message}`;
  console.log(line);
  if (!app.isPackaged) {
    return;
  }
  try {
    appendFileSync(envSetupLogPath(), `${line}\n`, "utf8");
  } catch {
    // ignore log write failures
  }
}

function getEnvSetupScriptPath(): string | undefined {
  if (!app.isPackaged) {
    const candidates = [
      join(__dirname, "checkserver.js"),
      join(__dirname, "..", "src", "checkserver.js"),
    ];
    return candidates.find((candidate) => existsSync(candidate));
  }

  const resourcesPath = process.resourcesPath;
  const relativeScript = join("dist", "checkserver.js");
  const candidates = [
    join(resourcesPath, "checkserver.js"),
    join(resourcesPath, "env-setup", "checkserver.js"),
    join(resourcesPath, "app.asar.unpacked", relativeScript),
    join(resourcesPath, "app-arm64.asar.unpacked", relativeScript),
    join(resourcesPath, "app-x64.asar.unpacked", relativeScript),
  ];

  try {
    for (const entry of readdirSync(resourcesPath)) {
      if (entry.endsWith(".asar.unpacked")) {
        candidates.push(join(resourcesPath, entry, relativeScript));
      }
    }
  } catch {
    // ignore unreadable Resources directory
  }

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      logEnvSetup(`found checkserver.js at ${candidate}`);
      return candidate;
    }
  }

  logEnvSetup(`checkserver.js not found (resourcesPath=${resourcesPath})`);
  logEnvSetup(`tried: ${candidates.join("; ")}`);
  return undefined;
}

function resolveExecutableScriptPath(sourcePath: string): string {
  if (!app.isPackaged) {
    return sourcePath;
  }

  const dest = join(app.getPath("userData"), "checkserver.js");
  mkdirSync(dirname(dest), { recursive: true });

  const srcSize = statSync(sourcePath).size;
  if (existsSync(dest) && statSync(dest).size === srcSize) {
    return dest;
  }

  writeFileSync(dest, readFileSync(sourcePath));
  logEnvSetup(`copied checkserver.js (${srcSize} bytes) to ${dest}`);
  return dest;
}

function getEnvSetupExecPath(): string {
  if (app.isPackaged && process.platform === "darwin") {
    const frameworksDir = join(process.resourcesPath, "..", "Frameworks");
    try {
      for (const entry of readdirSync(frameworksDir)) {
        if (!entry.endsWith(" Helper.app")) {
          continue;
        }
        const helperName = entry.replace(/\.app$/, "");
        const helperPath = join(frameworksDir, entry, "Contents", "MacOS", helperName);
        if (existsSync(helperPath)) {
          logEnvSetup(`using macOS Helper binary: ${helperPath}`);
          return helperPath;
        }
      }
    } catch {
      // ignore missing Frameworks directory
    }
    logEnvSetup(`no macOS Helper binary found under ${frameworksDir}`);
  }
  return process.execPath;
}

function getEnvRunnerPath(): string | undefined {
  if (!app.isPackaged) {
    const devRunner = join(__dirname, "env-runner.js");
    return existsSync(devRunner) ? devRunner : undefined;
  }

  const packagedRunner = join(process.resourcesPath, "env-runner.js");
  return existsSync(packagedRunner) ? packagedRunner : undefined;
}

function runScriptAsMainInProcess(scriptPath: string): void {
  const nodeModule = require("module") as typeof import("module") & {
    _load: (request: string, parent: NodeModule | null | undefined, isMain: boolean) => unknown;
  };

  process.chdir(dirname(scriptPath));
  process.argv = [process.argv[0], scriptPath];
  logEnvSetup(`fallback in-process main load: ${scriptPath}`);
  nodeModule._load(scriptPath, null, true);
  logEnvSetup("in-process main load completed");
}

function runEnvSetupScript(): void {
  logEnvSetup(`runEnvSetupScript start (packaged=${app.isPackaged})`);

  if (app.isPackaged && process.execPath.includes("/Volumes/")) {
    logEnvSetup(
      "WARNING: App is running from a DMG volume. Drag Edoc Viewer to /Applications before use."
    );
  }

  const sourcePath = getEnvSetupScriptPath();
  if (!sourcePath) {
    console.warn("Env setup script not found: checkserver.js");
    return;
  }

  const scriptPath = resolveExecutableScriptPath(sourcePath);
  const env = {
    ...process.env,
    ELECTRON_RUN_AS_NODE: "1",
    ELECTRON_NO_ATTACH_CONSOLE: "1",
  };
  const cwd = dirname(scriptPath);

  if (!app.isPackaged) {
    logEnvSetup(`running via exec: ${process.execPath} -> ${scriptPath}`);
    const command = `"${process.execPath.replace(/"/g, '\\"')}" "${scriptPath.replace(/"/g, '\\"')}"`;
    exec(
      command,
      {
        cwd,
        env,
        windowsHide: true,
        maxBuffer: 10 * 1024 * 1024,
        shell: process.platform === "win32" ? undefined : "/bin/bash",
      },
      handleEnvSetupExecResult
    );
    return;
  }

  const nodeBinary = getEnvSetupExecPath();
  const runnerPath = getEnvRunnerPath();
  const args = runnerPath ? [runnerPath, scriptPath] : [scriptPath];

  logEnvSetup(`spawning checkserver: ${nodeBinary} ${args.join(" ")}`);

  const child = spawn(nodeBinary, args, {
    cwd,
    env,
    detached: true,
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });

  child.stdout?.on("data", (data: Buffer) => {
    const text = data.toString().trimEnd();
    if (text) logEnvSetup(`stdout: ${text}`);
  });
  child.stderr?.on("data", (data: Buffer) => {
    const text = data.toString().trimEnd();
    if (text) logEnvSetup(`stderr: ${text}`);
  });

  child.on("error", (error) => {
    logEnvSetup(`spawn failed: ${error.message}`);
    try {
      runScriptAsMainInProcess(scriptPath);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logEnvSetup(`in-process fallback failed: ${message}`);
    }
  });

  child.on("spawn", () => {
    logEnvSetup(`checkserver running (pid=${child.pid ?? "unknown"})`);
    child.unref();
  });

  child.on("close", (code, signal) => {
    logEnvSetup(`checkserver exited (code=${code ?? "null"}, signal=${signal ?? "null"})`);
  });
}

function handleEnvSetupExecResult(
  error: Error | null,
  stdout: string,
  stderr: string
): void {
  if (stdout) logEnvSetup(`stdout: ${stdout.trimEnd()}`);
  if (stderr) logEnvSetup(`stderr: ${stderr.trimEnd()}`);
  if (error) {
    const code = "code" in error ? String(error.code) : "unknown";
    logEnvSetup(`exec failed (exit ${code}): ${error.message}`);
    console.error("Env setup script failed:", error.message);
  } else {
    logEnvSetup("exec completed successfully");
  }
}

function createWindow(): void {
  const iconPath = join(__dirname, "renderer", "ico.png");

  mainWindow = new BrowserWindow({
    title: "Edoc Viewer",
    ...(existsSync(iconPath) ? { icon: iconPath } : {}),
    width: 1280,
    height: 860,
    minWidth: 720,
    minHeight: 560,
    backgroundColor: "#09090b",
    show: false,
    ...(process.platform === "win32"
      ? {
          titleBarOverlay: {
            color: "#111113",
            symbolColor: "#fafafa",
            height: 40,
          },
        }
      : {}),
    webPreferences: {
      preload: join(__dirname, "preload.js"),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadFile(join(__dirname, "renderer", "index.html"));
  mainWindow.setMenuBarVisibility(false);
  mainWindow.once("ready-to-show", () => mainWindow?.show());
}

app.whenReady().then(async () => {
  Menu.setApplicationMenu(null);
  runEnvSetupScript();
  createWindow();
});

if (process.platform === "win32") {
  app.setAsDefaultProtocolClient("edoc");
}

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

ipcMain.handle("get-launch-edoc", (): EdocFileRef | null => {
  if (!launchEdocPath) return null;
  return toFileRef(launchEdocPath);
});

function dialogParent(event: IpcMainInvokeEvent): BrowserWindow | undefined {
  return BrowserWindow.fromWebContents(event.sender) ?? mainWindow ?? undefined;
}

ipcMain.handle("open-edoc-file", async (event): Promise<EdocFileRef | null> => {
  const parent = dialogParent(event);
  const options = {
    filters: [{ name: "Encrypted Document", extensions: ["edoc"] }],
    properties: ["openFile" as const],
  };
  const result = parent
    ? await dialog.showOpenDialog(parent, options)
    : await dialog.showOpenDialog(options);

  if (result.canceled || !result.filePaths[0]) {
    return null;
  }

  return toFileRef(result.filePaths[0]);
});

ipcMain.handle("stage-edoc-file", (_event, fileName: string, content: string): string => {
  const dir = join(app.getPath("temp"), "edoc-viewer");
  mkdirSync(dir, { recursive: true });
  const safeName = basename(fileName).replace(/[^\w.\-()+ ]/g, "_") || "document.edoc";
  const filePath = join(dir, `${Date.now()}-${safeName}`);
  writeFileSync(filePath, content, "utf8");
  return filePath;
});

ipcMain.handle("get-expiry-info", (_event, meta: EdocMeta) => getEdocExpiryInfo(meta));

ipcMain.handle("get-file-expiry-preview", (_event, filePath: string) => {
  try {
    let edoc = readEdocFile(filePath);
    if (isLegacyEdoc(edoc)) {
      return getEdocExpiryInfo(mergeLegacyEnvelope(edoc, filePath));
    }
    return { status: "locked" as const, mode: "encrypted" as const };
  } catch {
    return { status: "none" as const, mode: "absolute" as const };
  }
});

ipcMain.handle("decrypt-edoc", (_event, filePath: string, password: string) => {
  try {
    if (!filePath || !existsSync(filePath)) {
      throw new Error("File not found. Please select the .edoc file again.");
    }

    let prepared = readEdocFile(filePath);
    if (isLegacyEdoc(prepared)) {
      prepared = mergeLegacyEnvelope(prepared, filePath);
    }

    const sidecarFirstOpened = loadSidecarFirstOpened(trackingKey(prepared));

    const result = decryptEdocFull(prepared, {
      password: password || undefined,
      masterKey,
      firstOpenedAtOverride: sidecarFirstOpened,
    });

    const { envelope, meta } = persistFirstOpen(
      prepared,
      password,
      result.pdf,
      result.meta
    );

    writeUpdatedEdoc(envelope, filePath, meta);

    return {
      ok: true as const,
      data: Uint8Array.from(result.pdf),
      meta,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Decryption failed";
    return { ok: false as const, error: message };
  }
});
