const fs = require("fs");
const path = require("path");

fs.copyFileSync(
  path.join(__dirname, "..", "src", "schema.sql"),
  path.join(__dirname, "..", "dist", "schema.sql")
);
