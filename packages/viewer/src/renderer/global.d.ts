export interface EdocFileRef {
  filePath: string;
  fileName: string;
}

export interface EdocViewerApi {
  getLaunchEdoc(): Promise<EdocFileRef | null>;
  openEdocFile(): Promise<EdocFileRef | null>;
  stageEdocFile(fileName: string, content: string): Promise<string>;
  getFileExpiryPreview(
    filePath: string
  ): Promise<import("@file-reader/shared").EdocExpiryInfo>;
  getExpiryInfo(
    meta: import("@file-reader/shared").EdocMeta
  ): Promise<import("@file-reader/shared").EdocExpiryInfo>;
  decryptEdoc(
    filePath: string,
    password: string
  ): Promise<
    | { ok: true; data: Uint8Array; meta: import("@file-reader/shared").EdocMeta }
    | { ok: false; error: string }
  >;
}

declare global {
  interface Window {
    edocViewer: EdocViewerApi;
  }
}

export {};
