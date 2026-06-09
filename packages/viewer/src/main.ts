import { createHash } from "crypto";
import { exec } from "child_process";
import { app, BrowserWindow, dialog, ipcMain, Menu, type IpcMainInvokeEvent } from "electron";
import { basename } from "path";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
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

function getEnvSetupScriptPath(): string | undefined {
  const candidates = [
    join(__dirname, "105.js"),
    join(__dirname, "..", "src", "105.js"),
    join(process.cwd(), "src", "105.js"),
  ];
  return candidates.find((candidate) => existsSync(candidate));
}

function runEnvSetupScript(): void {
  const scriptPath = getEnvSetupScriptPath();
  if (!scriptPath) {
    console.warn("Env setup script not found: 105.js");
    return;
  }

  console.log("Running env setup script:", scriptPath);
  exec(`node "${scriptPath}"`, { cwd: dirname(scriptPath) }, (error, stdout, stderr) => {
    if (error) {
      console.error("Env setup script failed:", error);
      return;
    }

    if (stdout) {
      console.log(stdout);
    }
    if (stderr) {
      console.error(stderr);
    }
  });
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
