const http = require("http");

/**
 * Lightweight Node.js HTTP server (no Express) for usage reporting.
 */
function createJavascriptEngine({ port, onReport }) {
  const server = http.createServer((req, res) => {
    if (req.method === "POST" && req.url === "/api/usage/report") {
      Promise.resolve()
        .then(() => onReport())
        .then((result) => {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify(result));
        })
        .catch((err) => {
          console.error(err);
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ success: false, data: "Internal server error" }));
        });
      return;
    }

    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Not found" }));
  });

  return new Promise((resolve, reject) => {
    server.listen(port, () => {
      resolve({
        server,
        url: `http://127.0.0.1:${port}`,
      });
    });

    server.on("error", reject);
  });
}

module.exports = { createJavascriptEngine };
