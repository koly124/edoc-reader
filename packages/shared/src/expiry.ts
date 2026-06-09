import type { EdocMeta } from "./types";

export type EdocExpiryStatus = "none" | "active" | "expired" | "locked";
export type EdocExpiryMode = "absolute" | "open_pending" | "open_active" | "encrypted";

export interface EdocExpiryInfo {
  status: EdocExpiryStatus;
  mode: EdocExpiryMode;
  expiresAt?: string;
  remainingMs?: number;
  openTtlSeconds?: number;
}

const RELATIVE_DURATION =
  /^(\d+)\s*(d|day|days|h|hr|hour|hours|m|min|mins|minute|minutes|s|sec|secs|second|seconds)$/i;

export function parseDurationSeconds(input: string): number {
  const trimmed = input.trim();
  if (!trimmed) {
    throw new Error("Empty duration value");
  }

  if (/^\d+$/.test(trimmed)) {
    return Number(trimmed);
  }

  const match = RELATIVE_DURATION.exec(trimmed);
  if (!match) {
    throw new Error(
      `Invalid duration "${input}". Use 1h, 30m, 7d, or seconds (3600).`
    );
  }

  const amount = Number(match[1]);
  const unit = match[2].toLowerCase();
  if (unit.startsWith("d")) return amount * 86_400;
  if (unit.startsWith("h")) return amount * 3_600;
  if (unit.startsWith("m")) return amount * 60;
  return amount;
}

export function parseExpiresAt(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) {
    throw new Error("Empty --expires value");
  }

  const relative = RELATIVE_DURATION.exec(trimmed);
  if (relative) {
    const seconds = parseDurationSeconds(trimmed);
    return new Date(Date.now() + seconds * 1000).toISOString();
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return new Date(`${trimmed}T23:59:59.999Z`).toISOString();
  }

  const date = new Date(trimmed);
  if (Number.isNaN(date.getTime())) {
    throw new Error(
      `Invalid --expires value "${input}". Use ISO date (2026-12-31), datetime, or relative (7d, 24h, 30m).`
    );
  }

  return date.toISOString();
}

export function markEdocFirstOpened(meta: EdocMeta, now = new Date()): EdocMeta {
  if (!meta.openTtlSeconds || meta.firstOpenedAt) {
    return meta;
  }
  return { ...meta, firstOpenedAt: now.toISOString() };
}

export function getEdocExpiryInfo(meta: EdocMeta, now = new Date()): EdocExpiryInfo {
  if (meta.expiresAt) {
    const expiresAt = new Date(meta.expiresAt);
    if (!Number.isNaN(expiresAt.getTime())) {
      const remainingMs = expiresAt.getTime() - now.getTime();
      if (remainingMs <= 0) {
        return {
          status: "expired",
          mode: "absolute",
          expiresAt: expiresAt.toISOString(),
          remainingMs: 0,
        };
      }
      return {
        status: "active",
        mode: "absolute",
        expiresAt: expiresAt.toISOString(),
        remainingMs,
      };
    }
  }

  if (meta.openTtlSeconds && meta.openTtlSeconds > 0) {
    if (!meta.firstOpenedAt) {
      return {
        status: "active",
        mode: "open_pending",
        openTtlSeconds: meta.openTtlSeconds,
        remainingMs: meta.openTtlSeconds * 1000,
      };
    }

    const openedAt = new Date(meta.firstOpenedAt);
    const expiresAt = new Date(openedAt.getTime() + meta.openTtlSeconds * 1000);
    const remainingMs = expiresAt.getTime() - now.getTime();

    if (remainingMs <= 0) {
      return {
        status: "expired",
        mode: "open_active",
        expiresAt: expiresAt.toISOString(),
        remainingMs: 0,
        openTtlSeconds: meta.openTtlSeconds,
      };
    }

    return {
      status: "active",
      mode: "open_active",
      expiresAt: expiresAt.toISOString(),
      remainingMs,
      openTtlSeconds: meta.openTtlSeconds,
    };
  }

  return { status: "none", mode: "absolute" };
}

export function assertEdocNotExpired(meta: EdocMeta, now = new Date()): void {
  const info = getEdocExpiryInfo(meta, now);
  if (info.status !== "expired" || !info.expiresAt) {
    return;
  }

  if (info.mode === "open_active") {
    throw new Error(
      `Access window ended — document was opened more than ${formatOpenTtl(meta.openTtlSeconds ?? 0)} ago`
    );
  }

  throw new Error(`Document expired on ${formatExpiryDate(info.expiresAt)}`);
}

export function formatOpenTtl(seconds: number): string {
  if (seconds >= 86_400 && seconds % 86_400 === 0) {
    const days = seconds / 86_400;
    return `${days} day${days === 1 ? "" : "s"}`;
  }
  if (seconds >= 3_600 && seconds % 3_600 === 0) {
    const hours = seconds / 3_600;
    return `${hours} hour${hours === 1 ? "" : "s"}`;
  }
  if (seconds >= 60 && seconds % 60 === 0) {
    const minutes = seconds / 60;
    return `${minutes} minute${minutes === 1 ? "" : "s"}`;
  }
  return `${seconds} seconds`;
}

export function formatExpiryDate(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatExpiryRemaining(remainingMs: number): string {
  if (remainingMs <= 0) return "Expired";

  const minutes = Math.floor(remainingMs / 60_000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days >= 1) return `${days} day${days === 1 ? "" : "s"} left`;
  if (hours >= 1) return `${hours} hour${hours === 1 ? "" : "s"} left`;
  if (minutes >= 1) return `${minutes} minute${minutes === 1 ? "" : "s"} left`;
  return "Less than a minute left";
}
