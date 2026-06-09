#!/usr/bin/env node
const { spawnSync } = require("child_process");
const path = require("path");

const cli = path.join(__dirname, "..", "packages", "author", "dist", "cli.js");
const userArgs = process.argv.slice(2);
const args = userArgs[0] === "encrypt" ? userArgs : ["encrypt", ...userArgs];

if (args.length < 2 || args[1] === "--help" || args[1] === "-h") {
  console.log(`Usage:
  npm run encrypt -- sample.pdf --password "secret" [--name "Title"] [--out file.edoc]
    [--expires 30d] [--expires-after-open 1h]
`);
  process.exit(args[1] === "--help" || args[1] === "-h" ? 0 : 1);
}

const result = spawnSync(process.execPath, [cli, ...args], { stdio: "inherit" });
process.exit(result.status ?? 1);
