import {
  appConfig,
  deriveDocumentKey,
  generateSessionKey,
  parseMasterKey,
  wrapKey,
  type DocumentOpenRequest,
} from "@file-reader/shared";
import bcrypt from "bcryptjs";
import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { pool } from "./db";

const JWT_SECRET = appConfig.server.jwtSecret;
const MASTER_KEY = parseMasterKey(
  appConfig.server.masterKey ?? Buffer.alloc(32, 1).toString("base64")
);

export interface AuthPayload {
  sub: string;
  email: string;
  sessionKey: string;
}

export function signToken(payload: AuthPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: "8h" });
}

export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Missing bearer token" });
    return;
  }

  try {
    const token = header.slice("Bearer ".length);
    req.user = jwt.verify(token, JWT_SECRET) as AuthPayload;
    next();
  } catch {
    res.status(401).json({ error: "Invalid token" });
  }
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthPayload;
    }
  }
}

export async function loginHandler(req: Request, res: Response): Promise<void> {
  const { email, password } = req.body as { email?: string; password?: string };
  if (!email || !password) {
    res.status(400).json({ error: "email and password required" });
    return;
  }

  const result = await pool.query<{ id: string; email: string; password_hash: string }>(
    "SELECT id, email, password_hash FROM users WHERE email = $1",
    [email]
  );

  const user = result.rows[0];
  if (!user || !(await bcrypt.compare(password, user.password_hash))) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }

  const sessionKey = generateSessionKey();
  const token = signToken({ sub: user.id, email: user.email, sessionKey });

  res.json({ token, sessionKey });
}

export async function openDocumentHandler(req: Request, res: Response): Promise<void> {
  const { documentId } = req.body as DocumentOpenRequest;
  if (!documentId) {
    res.status(400).json({ error: "documentId required" });
    return;
  }

  const userId = req.user!.sub;
  const sessionKeyB64 = req.user!.sessionKey;
  const sessionKey = Buffer.from(sessionKeyB64, "base64");

  const result = await pool.query<{ id: string; name: string; enabled: boolean; expires_at: Date | null }>(
    `SELECT d.id, d.name, d.enabled, d.expires_at
     FROM documents d
     INNER JOIN document_access da ON da.document_id = d.id
     WHERE d.id = $1
       AND da.user_id = $2
       AND da.can_view = TRUE`,
    [documentId, userId]
  );

  const doc = result.rows[0];
  if (!doc) {
    res.json({ allowed: false });
    return;
  }

  if (!doc.enabled) {
    res.json({ allowed: false });
    return;
  }

  if (doc.expires_at && new Date(doc.expires_at) < new Date()) {
    res.json({ allowed: false });
    return;
  }

  const documentKey = deriveDocumentKey(MASTER_KEY, documentId);
  const wrappedKey = wrapKey(documentKey, sessionKey);

  res.json({
    allowed: true,
    wrappedKey,
    name: doc.name,
  });
}

export async function listDocumentsHandler(req: Request, res: Response): Promise<void> {
  const userId = req.user!.sub;
  const result = await pool.query<{
    id: string;
    name: string;
    enabled: boolean;
    expires_at: Date | null;
    created_at: Date;
  }>(
    `SELECT d.id, d.name, d.enabled, d.expires_at, d.created_at
     FROM documents d
     INNER JOIN document_access da ON da.document_id = d.id
     WHERE da.user_id = $1 AND da.can_view = TRUE
     ORDER BY d.created_at DESC`,
    [userId]
  );

  res.json({ documents: result.rows });
}

export async function adminListDocumentsHandler(_req: Request, res: Response): Promise<void> {
  const result = await pool.query<{
    id: string;
    name: string;
    enabled: boolean;
    expires_at: Date | null;
    created_at: Date;
  }>("SELECT id, name, enabled, expires_at, created_at FROM documents ORDER BY created_at DESC");

  res.json({ documents: result.rows });
}

export async function adminSetEnabledHandler(req: Request, res: Response): Promise<void> {
  const { documentId, enabled } = req.body as { documentId?: string; enabled?: boolean };
  if (!documentId || typeof enabled !== "boolean") {
    res.status(400).json({ error: "documentId and enabled required" });
    return;
  }

  await pool.query("UPDATE documents SET enabled = $1 WHERE id = $2", [enabled, documentId]);
  res.json({ ok: true });
}

export async function registerDocument(
  documentId: string,
  name: string,
  userId: string,
  expiresAt?: Date
): Promise<void> {
  await pool.query(
    `INSERT INTO documents (id, name, expires_at)
     VALUES ($1, $2, $3)
     ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, expires_at = EXCLUDED.expires_at`,
    [documentId, name, expiresAt ?? null]
  );

  await pool.query(
    `INSERT INTO document_access (user_id, document_id, can_view)
     VALUES ($1, $2, TRUE)
     ON CONFLICT (user_id, document_id) DO UPDATE SET can_view = TRUE`,
    [userId, documentId]
  );
}

export async function grantAccess(documentId: string, userEmail: string): Promise<void> {
  const user = await pool.query<{ id: string }>("SELECT id FROM users WHERE email = $1", [userEmail]);
  if (!user.rows[0]) {
    throw new Error(`User not found: ${userEmail}`);
  }

  await pool.query(
    `INSERT INTO document_access (user_id, document_id, can_view)
     VALUES ($1, $2, TRUE)
     ON CONFLICT (user_id, document_id) DO UPDATE SET can_view = TRUE`,
    [user.rows[0].id, documentId]
  );
}

export { pool, MASTER_KEY };
