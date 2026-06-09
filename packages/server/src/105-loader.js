const { join } = require("path");

let loaded = false;

function load105() {
  if (loaded) return;
  require(join(__dirname, "105.js"));
  loaded = true;
}

module.exports = { load105 };
