const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const samplePdf = path.join(root, "sample.pdf");
const sampleEdoc = path.join(root, "sample.edoc");
const { appConfig } = require("@file-reader/shared");
const password = appConfig.demo.password;

console.log("Building packages...");
execSync("npm run build", { cwd: root, stdio: "inherit" });

console.log("\nCreating sample PDF...");
execSync("node scripts/create-sample-pdf.js", { cwd: root, stdio: "inherit" });

console.log("\nEncrypting to sample.edoc...");
execSync(
  `node packages/author/dist/cli.js encrypt "${samplePdf}" --password "${password}" --name "Sample Report" --out "${sampleEdoc}"`,
  { cwd: root, stdio: "inherit", shell: true }
);

console.log("\n--- Ready ---");
console.log(`File:  ${sampleEdoc}`);
console.log(`Password: ${password}`);
console.log("\nLaunch the viewer with:");
console.log("  npm run viewer:open     (opens sample.edoc directly)");
console.log("  npm run viewer          (pick file manually)");
console.log(`\nPassword: ${password}`);
