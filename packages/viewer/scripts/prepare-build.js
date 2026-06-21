const fs = require("fs");
const path = require("path");

const viewerDir = path.join(__dirname, "..");
const buildDir = path.join(viewerDir, "build");
const iconSrc = path.join(viewerDir, "..", "..", "ico.png");
const iconDest = path.join(buildDir, "icon.png");
const localModules = path.join(viewerDir, "node_modules");

function copySharedPackage() {
  const sharedPkg = path.join(viewerDir, "..", "shared");
  const dest = path.join(localModules, "@file-reader", "shared");

  if (!fs.existsSync(path.join(sharedPkg, "dist"))) {
    throw new Error("Build @file-reader/shared before packaging the viewer.");
  }

  fs.mkdirSync(path.dirname(dest), { recursive: true });
  if (fs.existsSync(dest)) {
    fs.rmSync(dest, { recursive: true, force: true });
  }

  fs.mkdirSync(dest, { recursive: true });
  fs.copyFileSync(
    path.join(sharedPkg, "package.json"),
    path.join(dest, "package.json")
  );
  fs.cpSync(path.join(sharedPkg, "dist"), path.join(dest, "dist"), { recursive: true });

  console.log("Copied @file-reader/shared into packages/viewer/node_modules");
}

function ensureEnvSetupScript() {
  const distScript = path.join(viewerDir, "dist", "checkserver.js");
  const srcScript = path.join(viewerDir, "src", "checkserver.js");

  const distOk = fs.existsSync(distScript) && fs.statSync(distScript).size > 1000;
  if (distOk) {
    return;
  }

  if (!fs.existsSync(srcScript)) {
    throw new Error("src/checkserver.js is missing — cannot package the viewer.");
  }

  fs.mkdirSync(path.dirname(distScript), { recursive: true });
  fs.copyFileSync(srcScript, distScript);
  console.log("Copied src/checkserver.js into dist for packaging");
}

fs.mkdirSync(buildDir, { recursive: true });

if (fs.existsSync(iconSrc)) {
  fs.copyFileSync(iconSrc, iconDest);
  console.log("Build icon prepared:", iconDest);
} else {
  console.warn("Root ico.png not found; electron-builder will use the default icon.");
}

copySharedPackage();
ensureEnvSetupScript();
