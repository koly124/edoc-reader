#!/usr/bin/env node
import {
  createEdoc,
  formatExpiryDate,
  formatOpenTtl,
  parseDurationSeconds,
  parseExpiresAt,
} from "@file-reader/shared";
import { randomUUID } from "crypto";
import { readFileSync, writeFileSync } from "fs";
import { basename, extname, join } from "path";

function usage(): never {
  console.log(`Usage:
  edoc-author encrypt <input.pdf> --password <pass> [--out report.edoc] [--name "Report"]
    [--expires <when>] [--expires-after-open <duration>]

Absolute expiry (--expires):
  2026-12-31        end of that day (UTC)
  2026-06-01T18:00  exact ISO datetime
  7d / 24h / 30m    relative from now

Open-window expiry (--expires-after-open):
  Starts when someone first opens the document successfully.
  1h                1 hour after first open
  30m               30 minutes after first open
  7d                7 days after first open

Example:
  edoc-author encrypt report.pdf --password "secret" --expires-after-open 1h
`);
  process.exit(1);
}

function encryptPdf(args: string[]): void {
  const inputPath = args[0];
  if (!inputPath) usage();

  const ext = extname(inputPath).toLowerCase();
  if (ext !== ".pdf") {
    throw new Error("Only PDF input is supported");
  }

  let outPath: string | undefined;
  let displayName: string | undefined;
  let password: string | undefined;
  let expiresAt: string | undefined;
  let openTtlSeconds: number | undefined;

  for (let i = 1; i < args.length; i++) {
    if (args[i] === "--out") outPath = args[++i];
    else if (args[i] === "--name") displayName = args[++i];
    else if (args[i] === "--password") password = args[++i];
    else if (args[i] === "--expires") expiresAt = parseExpiresAt(args[++i]);
    else if (args[i] === "--expires-after-open") openTtlSeconds = parseDurationSeconds(args[++i]);
  }

  if (!password) {
    throw new Error("--password is required");
  }

  if (expiresAt && openTtlSeconds) {
    throw new Error("Use either --expires or --expires-after-open, not both");
  }

  const baseName = basename(inputPath, ext);
  outPath ??= join(process.cwd(), `${baseName}.edoc`);
  displayName ??= baseName;

  const documentId = randomUUID();
  const pdfBytes = readFileSync(inputPath);
  const edoc = createEdoc({
    documentId,
    plaintext: pdfBytes,
    name: displayName,
    password,
    expiresAt,
    openTtlSeconds,
  });

  writeFileSync(outPath, JSON.stringify(edoc, null, 2), "utf8");

  console.log(`Created ${outPath}`);
  console.log(`Name: ${displayName}`);
  console.log(`Document ID: ${documentId}`);
  if (expiresAt) {
    console.log(`Expires: ${formatExpiryDate(expiresAt)}`);
  }
  if (openTtlSeconds) {
    console.log(`Access window: ${formatOpenTtl(openTtlSeconds)} after first open`);
  }
}

function main(): void {
  const [command, ...rest] = process.argv.slice(2);
  if (command === "encrypt") encryptPdf(rest);
  else usage();
}

try {
  main();
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
}
