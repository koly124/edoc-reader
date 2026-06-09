const esbuild = require("esbuild");
const path = require("path");

esbuild
  .build({
    entryPoints: [path.join(__dirname, "..", "src", "renderer", "app.js")],
    bundle: true,
    outfile: path.join(__dirname, "..", "dist", "renderer", "app.bundle.js"),
    platform: "browser",
    format: "iife",
    target: "chrome120",
    sourcemap: true,
  })
  .then(() => console.log("Renderer bundled."))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
