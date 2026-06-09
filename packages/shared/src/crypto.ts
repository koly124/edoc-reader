import {
  createCipheriv,
  createDecipheriv,
  hkdfSync,
  pbkdf2Sync,
  randomBytes,
} from "crypto";
import { assertEdocNotExpired, markEdocFirstOpened } from "./expiry";
import {
  EDOC_ALGORITHM,
  EDOC_KDF,
  EDOC_KDF_ITERATIONS,
  EDOC_VERSION,
  isEncryptedEnvelope,
  isLegacyEdoc,
  type EdocEnvelope,
  type EdocFile,
  type EdocInnerPayload,
  type EdocLegacyV1,
  type EdocMeta,
} from "./types";

const KEY_LENGTH = 32;
const IV_LENGTH = 12;
const TAG_LENGTH = 16;

export interface CreateEdocOptions {
  documentId: string;
  plaintext: Buffer;
  name?: string;
  password: string;
  expiresAt?: string;
  openTtlSeconds?: number;
}

export interface DecryptEdocResult {
  pdf: Buffer;
  meta: EdocMeta;
  envelope: EdocFile;
}

export function deriveMasterKeyFromPassword(
  password: string,
  salt: Buffer,
  iterations = EDOC_KDF_ITERATIONS
): Buffer {
  return pbkdf2Sync(password, salt, iterations, KEY_LENGTH, "sha256");
}

export function deriveDocumentKey(masterKey: Buffer, documentId: string): Buffer {
  return Buffer.from(
    hkdfSync("sha256", masterKey, Buffer.from(documentId, "utf8"), "edoc-document-key", KEY_LENGTH)
  );
}

function encryptPayload(payload: EdocInnerPayload, key: Buffer): Pick<EdocEnvelope, "iv" | "ciphertext" | "tag"> {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const plaintext = Buffer.from(JSON.stringify(payload), "utf8");
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return {
    iv: iv.toString("base64"),
    ciphertext: encrypted.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
  };
}

function decryptPayload(
  envelope: Pick<EdocEnvelope, "iv" | "ciphertext" | "tag" | "kdfSalt" | "kdfIterations">,
  password: string
): EdocInnerPayload {
  const salt = Buffer.from(envelope.kdfSalt, "base64");
  const key = deriveMasterKeyFromPassword(password, salt, envelope.kdfIterations);
  const iv = Buffer.from(envelope.iv, "base64");
  const ciphertext = Buffer.from(envelope.ciphertext, "base64");
  const tag = Buffer.from(envelope.tag, "base64");

  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  const json = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
  const payload = JSON.parse(json) as EdocInnerPayload;

  if (!payload.documentId || !payload.data) {
    throw new Error("Invalid encrypted .edoc payload");
  }

  return payload;
}

export function sealEdoc(payload: EdocInnerPayload, password: string, salt?: Buffer): EdocEnvelope {
  const kdfSalt = salt ?? randomBytes(16);
  const key = deriveMasterKeyFromPassword(password, kdfSalt);
  const encrypted = encryptPayload(payload, key);

  return {
    version: EDOC_VERSION,
    algorithm: EDOC_ALGORITHM,
    kdf: EDOC_KDF,
    kdfSalt: kdfSalt.toString("base64"),
    kdfIterations: EDOC_KDF_ITERATIONS,
    ...encrypted,
  };
}

export function createEdoc(options: CreateEdocOptions): EdocEnvelope {
  const payload: EdocInnerPayload = {
    documentId: options.documentId,
    name: options.name,
    expiresAt: options.expiresAt,
    openTtlSeconds: options.openTtlSeconds,
    contentType: "application/pdf",
    data: options.plaintext.toString("base64"),
  };

  return sealEdoc(payload, options.password);
}

function decryptLegacyV1(
  edoc: EdocLegacyV1,
  options: { password?: string; masterKey?: Buffer }
): DecryptEdocResult {
  assertEdocNotExpired(edoc);

  let masterKey: Buffer;
  if (edoc.kdfSalt) {
    if (!options.password) throw new Error("Password required");
    masterKey = deriveMasterKeyFromPassword(
      options.password,
      Buffer.from(edoc.kdfSalt, "base64"),
      edoc.kdfIterations ?? EDOC_KDF_ITERATIONS
    );
  } else if (options.masterKey) {
    masterKey = options.masterKey;
  } else {
    throw new Error("Password required");
  }

  const key = deriveDocumentKey(masterKey, edoc.documentId);
  const iv = Buffer.from(edoc.iv, "base64");
  const ciphertext = Buffer.from(edoc.ciphertext, "base64");
  const tag = Buffer.from(edoc.tag, "base64");

  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  const pdf = Buffer.concat([decipher.update(ciphertext), decipher.final()]);

  const meta: EdocMeta = {
    documentId: edoc.documentId,
    name: edoc.name,
    expiresAt: edoc.expiresAt,
    openTtlSeconds: edoc.openTtlSeconds,
    firstOpenedAt: edoc.firstOpenedAt,
  };

  return { pdf, meta, envelope: edoc };
}

export function decryptEdocFull(
  edoc: EdocFile,
  options: {
    password?: string;
    masterKey?: Buffer;
    firstOpenedAtOverride?: string;
  }
): DecryptEdocResult {
  if (isLegacyEdoc(edoc)) {
    return decryptLegacyV1(edoc, options);
  }

  if (!isEncryptedEnvelope(edoc)) {
    throw new Error("Unsupported .edoc format");
  }

  if (!options.password) {
    throw new Error("Password required");
  }

  const payload = decryptPayload(edoc, options.password);
  let meta: EdocMeta = {
    documentId: payload.documentId,
    name: payload.name,
    expiresAt: payload.expiresAt,
    openTtlSeconds: payload.openTtlSeconds,
    firstOpenedAt: payload.firstOpenedAt,
  };

  if (options.firstOpenedAtOverride && !meta.firstOpenedAt) {
    meta = { ...meta, firstOpenedAt: options.firstOpenedAtOverride };
  }

  assertEdocNotExpired(meta);

  return {
    pdf: Buffer.from(payload.data, "base64"),
    meta,
    envelope: edoc,
  };
}

export function decryptEdoc(
  edoc: EdocFile,
  options: { password?: string; masterKey?: Buffer }
): Buffer {
  return decryptEdocFull(edoc, options).pdf;
}

export function updateEncryptedEdoc(
  envelope: EdocEnvelope,
  meta: EdocMeta,
  pdf: Buffer,
  password: string
): EdocEnvelope {
  const payload: EdocInnerPayload = {
    ...meta,
    contentType: "application/pdf",
    data: pdf.toString("base64"),
  };

  const salt = Buffer.from(envelope.kdfSalt, "base64");
  return sealEdoc(payload, password, salt);
}

export function persistFirstOpen(
  edoc: EdocFile,
  password: string,
  pdf: Buffer,
  meta: EdocMeta
): { envelope: EdocFile; meta: EdocMeta } {
  if (meta.firstOpenedAt || !meta.openTtlSeconds) {
    return { envelope: edoc, meta };
  }

  const updatedMeta = markEdocFirstOpened(meta);

  if (isEncryptedEnvelope(edoc)) {
    return {
      envelope: updateEncryptedEdoc(edoc, updatedMeta, pdf, password),
      meta: updatedMeta,
    };
  }

  if (isLegacyEdoc(edoc)) {
    return {
      envelope: { ...edoc, ...updatedMeta },
      meta: updatedMeta,
    };
  }

  return { envelope: edoc, meta: updatedMeta };
}

/** @deprecated Legacy server-side key wrapping. */
export function encryptDocument(
  masterKey: Buffer,
  documentId: string,
  plaintext: Buffer
): EdocLegacyV1 {
  const key = deriveDocumentKey(masterKey, documentId);
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();

  return {
    version: 1,
    documentId,
    algorithm: EDOC_ALGORITHM,
    iv: iv.toString("base64"),
    ciphertext: encrypted.toString("base64"),
    tag: tag.toString("base64"),
  };
}

export function wrapKey(documentKey: Buffer, sessionKey: Buffer): string {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv("aes-256-gcm", sessionKey, iv);
  const wrapped = Buffer.concat([cipher.update(documentKey), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, wrapped]).toString("base64");
}

export function unwrapKey(wrappedKeyB64: string, sessionKey: Buffer): Buffer {
  const data = Buffer.from(wrappedKeyB64, "base64");
  const iv = data.subarray(0, IV_LENGTH);
  const tag = data.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
  const wrapped = data.subarray(IV_LENGTH + TAG_LENGTH);

  const decipher = createDecipheriv("aes-256-gcm", sessionKey, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(wrapped), decipher.final()]);
}

export function parseMasterKey(raw: string): Buffer {
  const key = Buffer.from(raw, "base64");
  if (key.length !== KEY_LENGTH) {
    throw new Error("MASTER_KEY must be a base64-encoded 32-byte value");
  }
  return key;
}

export function generateSessionKey(): string {
  return randomBytes(KEY_LENGTH).toString("base64");
}
