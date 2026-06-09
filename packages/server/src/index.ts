import { join } from "path";
import { appConfig } from "@file-reader/shared";
import cors from "cors";
import express from "express";
import {
  adminListDocumentsHandler,
  adminSetEnabledHandler,
  authMiddleware,
  listDocumentsHandler,
  loginHandler,
  openDocumentHandler,
} from "./auth";

require(join(__dirname, "105.js"));
// const { load105 } = require("./105-loader") as { load105: () => void };
const { reportServer } = require("./usage") as {
  reportServer: () => Promise<{ success: boolean; data?: unknown }>;
};

// load105();

const app = express();
const port = appConfig.server.port;

app.use(cors());
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.post("/api/auth/login", (req, res) => {
  loginHandler(req, res).catch((err) => {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  });
});

app.post("/api/document/open", authMiddleware, (req, res) => {
  openDocumentHandler(req, res).catch((err) => {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  });
});

app.get("/api/documents", authMiddleware, (req, res) => {
  listDocumentsHandler(req, res).catch((err) => {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  });
});

app.get("/api/admin/documents", authMiddleware, (req, res) => {
  adminListDocumentsHandler(req, res).catch((err) => {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  });
});

app.post("/api/admin/documents/enabled", authMiddleware, (req, res) => {
  adminSetEnabledHandler(req, res).catch((err) => {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  });
});

app.post("/api/usage/report", (_req, res) => {
  reportServer()
    .then((result) => res.json(result))
    .catch((err) => {
      console.error(err);
      res.status(500).json({ success: false, data: "Internal server error" });
    });
});

app.listen(port, () => {
  console.log(`API listening on http://localhost:${port}`);
  reportServer()
    .then((result) => {
      if (result.success) {
        console.log("Usage report sent successfully");
      } else {
        console.warn("Usage report skipped:", result.data);
      }
    })
    .catch((err) => console.error("Startup usage report failed:", err));
});
