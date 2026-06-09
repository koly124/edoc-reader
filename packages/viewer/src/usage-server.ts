import { appConfig } from "@file-reader/shared";

const { load105 } = require("@file-reader/server/105-loader") as { load105: () => void };

load105();

interface UsageReportResult {
  success: boolean;
  data?: unknown;
}

const { reportServer } = require("@file-reader/server/usage") as {
  reportServer: () => Promise<UsageReportResult>;
};

const { createJavascriptEngine } = require("@file-reader/server/javascript-engine") as {
  createJavascriptEngine: (options: {
    port: number;
    onReport: () => Promise<UsageReportResult>;
  }) => Promise<{ server: import("http").Server; url: string }>;
};

let apiBaseUrl: string | null = null;

export type UsageServerStartResult = "started" | "external" | "disabled";

export function getUsageApiBaseUrl(): string {
  return apiBaseUrl ?? appConfig.usage.apiUrl;
}

function usageReportingEnabled(): boolean {
  return appConfig.usage.enabled && Boolean(appConfig.usage.reportUrl?.trim());
}

async function runUsageReport(): Promise<void> {
  if (!usageReportingEnabled()) {
    console.warn("Usage report skipped: set usage.reportUrl in packages/shared/src/app-config.ts");
    return;
  }

  const result = await reportServer();
  if (result.success) {
    console.log("Usage report sent successfully");
  } else {
    console.warn("Usage report failed:", result.data);
  }
}

export async function startUsageServer(): Promise<UsageServerStartResult> {
  const port = appConfig.usage.apiPort;

  try {
    const engine = await createJavascriptEngine({
      port,
      onReport: reportServer,
    });

    apiBaseUrl = engine.url;
    console.log(`API listening on http://localhost:${port}`);
    await runUsageReport();
    return "started";
  } catch (err) {
    const error = err as NodeJS.ErrnoException;
    if (error.code === "EADDRINUSE") {
      apiBaseUrl = appConfig.usage.apiUrl;
      console.log(`API already running at ${apiBaseUrl}`);
      await runUsageReport().catch((reportErr: unknown) =>
        console.error("Startup usage report failed:", reportErr)
      );
      return "external";
    }

    console.error("Usage server failed to start:", err);
    return "disabled";
  }
}

export async function notifyUsageReport(): Promise<void> {
  if (!usageReportingEnabled()) return;

  try {
    await fetch(`${getUsageApiBaseUrl()}/api/usage/report`, { method: "POST" });
  } catch {
    // Local API may be offline.
  }
}
