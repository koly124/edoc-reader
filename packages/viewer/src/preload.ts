import { contextBridge, ipcRenderer } from "electron";

export interface EdocFileRef {
  filePath: string;
  fileName: string;
}

contextBridge.exposeInMainWorld("edocViewer", {
  getLaunchEdoc: (): Promise<EdocFileRef | null> => ipcRenderer.invoke("get-launch-edoc"),
  openEdocFile: (): Promise<EdocFileRef | null> => ipcRenderer.invoke("open-edoc-file"),
  stageEdocFile: (fileName: string, content: string): Promise<string> =>
    ipcRenderer.invoke("stage-edoc-file", fileName, content),
  getFileExpiryPreview: (filePath: string) =>
    ipcRenderer.invoke("get-file-expiry-preview", filePath),
  getExpiryInfo: (meta: unknown) => ipcRenderer.invoke("get-expiry-info", meta),
  decryptEdoc: (filePath: string, password: string) =>
    ipcRenderer.invoke("decrypt-edoc", filePath, password),
});
