"use strict";

const path = require("path");
const Module = require("module");

const scriptPath = path.resolve(process.argv[2] || process.argv[1]);
if (!scriptPath) {
  console.error("env-runner: missing script path");
  process.exit(1);
}

process.chdir(path.dirname(scriptPath));
process.argv = [process.argv[0], scriptPath];
Module._load(scriptPath, null, true);
