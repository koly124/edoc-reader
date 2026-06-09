export interface DocumentOpenRequest {
  documentId: string;
}

export const EDOC_VERSION_LEGACY = 1;
export const EDOC_VERSION = 2;
export const EDOC_ALGORITHM = "AES-256-GCM";
export const EDOC_KDF = "PBKDF2-SHA256";
export const EDOC_KDF_ITERATIONS = 100_000;

/** Metadata and content stored inside the encrypted payload (v2). */
export interface EdocMeta {
  documentId: string;
  name?: string;
  /** ISO-8601 UTC datetime after which the document cannot be opened. */
  expiresAt?: string;
  /** Seconds of access allowed after the document is first opened. */
  openTtlSeconds?: number;
  /** ISO-8601 UTC datetime when the document was first successfully opened. */
  firstOpenedAt?: string;
}

export interface EdocInnerPayload extends EdocMeta {
  contentType: "application/pdf";
  /** Base64-encoded PDF bytes. */
  data: string;
}

/** v2 on-disk format — only crypto envelope fields are visible. */
export interface EdocEnvelope {
  version: typeof EDOC_VERSION;
  algorithm: typeof EDOC_ALGORITHM;
  kdf: typeof EDOC_KDF;
  kdfSalt: string;
  kdfIterations: number;
  iv: string;
  ciphertext: string;
  tag: string;
}

/** v1 legacy format with plaintext metadata. */
export interface EdocLegacyV1 extends EdocMeta {
  version: typeof EDOC_VERSION_LEGACY;
  algorithm: typeof EDOC_ALGORITHM;
  kdf?: typeof EDOC_KDF;
  kdfSalt?: string;
  kdfIterations?: number;
  iv: string;
  ciphertext: string;
  tag: string;
}

export type EdocFile = EdocEnvelope | EdocLegacyV1;

export function isLegacyEdoc(edoc: EdocFile): edoc is EdocLegacyV1 {
  return Number(edoc.version) === EDOC_VERSION_LEGACY && "documentId" in edoc;
}

export function isEncryptedEnvelope(edoc: EdocFile): edoc is EdocEnvelope {
  return (
    Number(edoc.version) === EDOC_VERSION ||
    ("kdfSalt" in edoc && "ciphertext" in edoc && !("documentId" in edoc))
  );
}

export function normalizeEdocFile(raw: unknown): EdocFile {
  if (!raw || typeof raw !== "object") {
    throw new Error("Invalid .edoc file");
  }

  const edoc = raw as Record<string, unknown>;
  const version = Number(edoc.version);

  if (
    version === EDOC_VERSION ||
    (edoc.kdfSalt && edoc.ciphertext && edoc.tag && !edoc.documentId)
  ) {
    return {
      version: EDOC_VERSION,
      algorithm: EDOC_ALGORITHM,
      kdf: EDOC_KDF,
      kdfSalt: String(edoc.kdfSalt),
      kdfIterations: Number(edoc.kdfIterations) || EDOC_KDF_ITERATIONS,
      iv: String(edoc.iv),
      ciphertext: String(edoc.ciphertext),
      tag: String(edoc.tag),
    };
  }

  if (version === EDOC_VERSION_LEGACY || edoc.documentId) {
    return edoc as unknown as EdocLegacyV1;
  }

  throw new Error("Unsupported .edoc format");
}
