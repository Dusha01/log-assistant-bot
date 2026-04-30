import http from "node:http";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { URL } from "node:url";

import { config } from "../../core/config.js";
import { readStateFile } from "../worker/state.js";
import { runAwayAnalysis, runOneShotAnalysis } from "../worker/run-analysis.js";
import { ApiError, toApiErrorResponse } from "./errors.js";
import { parseSecurityMarkdown } from "./report-parser.js";
import { ReportFileNameSchema } from "./schemas.js";

type Json = Record<string, unknown>;

function sendJson(res: http.ServerResponse, status: number, body: Json): void {
  const payload = JSON.stringify(body, null, 2);
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Content-Length", Buffer.byteLength(payload));
  res.end(payload);
}

async function resolveLatestReportPath(): Promise<string | null> {
  // Prefer checkpoint pointer.
  try {
    const state = await readStateFile(config.stateFilePath);
    if (state.lastReportPath) return state.lastReportPath;
  } catch {
    // ignore
  }

  // Fallback: scan reportsDir for prefix-*.md and pick lexicographically latest (ISO timestamps).
  try {
    const entries = await readdir(config.reportsDir, { withFileTypes: true });
    const candidates = entries
      .filter((e) => e.isFile())
      .map((e) => e.name)
      .filter((name) => name.startsWith(`${config.reportPrefix}-`) && name.endsWith(".md"))
      .sort((a, b) => a.localeCompare(b));
    const latest = candidates[candidates.length - 1];
    return latest ? path.join(config.reportsDir, latest) : null;
  } catch {
    return null;
  }
}

async function readAndParseReport(filePath: string): Promise<ReturnType<typeof parseSecurityMarkdown>> {
  const raw = await readFile(filePath, "utf8");
  return parseSecurityMarkdown(raw);
}

async function listReportFiles(): Promise<{ name: string; path: string }[]> {
  const entries = await readdir(config.reportsDir, { withFileTypes: true });
  const names = entries
    .filter((e) => e.isFile())
    .map((e) => e.name)
    .filter((name) => name.startsWith(`${config.reportPrefix}-`) && name.endsWith(".md"))
    // newest first (ISO timestamp in name -> lexicographic works)
    .sort((a, b) => b.localeCompare(a));

  return names.map((name) => ({ name, path: path.join(config.reportsDir, name) }));
}

let analysisRunning = false;
async function runAnalysisAndReturnLatest(mode: "once" | "away"): Promise<{ path: string; report: unknown }> {
  if (analysisRunning) {
    throw new ApiError("analysis_already_running", "analysis already running");
  }
  analysisRunning = true;
  try {
    if (mode === "away") {
      await runAwayAnalysis();
    } else {
      await runOneShotAnalysis();
    }
  } finally {
    analysisRunning = false;
  }

  const latestPath = await resolveLatestReportPath();
  if (!latestPath) {
    throw new ApiError("no_reports_found", "no reports found");
  }
  const parsed = await readAndParseReport(latestPath);
  return { path: latestPath, report: parsed };
}

export function createApiServer(): http.Server {
  return http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
      const method = (req.method ?? "GET").toUpperCase();
      const pathname = url.pathname.length > 1 ? url.pathname.replace(/\/+$/, "") : url.pathname;

      if (method === "GET" && pathname === "/health") {
        sendJson(res, 200, { ok: true });
        return;
      }

      if (method === "GET" && pathname === "/reports") {
        const reports = await listReportFiles();
        sendJson(res, 200, { reports });
        return;
      }

      if (method === "POST" && pathname === "/analyze/once") {
        const result = await runAnalysisAndReturnLatest("once");
        sendJson(res, 200, result as unknown as Json);
        return;
      }

      if (method === "POST" && pathname === "/analyze/away") {
        const result = await runAnalysisAndReturnLatest("away");
        sendJson(res, 200, result as unknown as Json);
        return;
      }

      if (method === "GET" && pathname === "/reports/latest") {
        const latestPath = await resolveLatestReportPath();
        if (!latestPath) {
          sendJson(res, 404, { error: "no_reports_found" });
          return;
        }
        const parsed = await readAndParseReport(latestPath);
        sendJson(res, 200, { path: latestPath, report: parsed });
        return;
      }

      if (method === "GET" && pathname.startsWith("/reports/")) {
        const rawFileName = decodeURIComponent(pathname.slice("/reports/".length));
        const parsedName = ReportFileNameSchema.safeParse(rawFileName);
        if (!parsedName.success) {
          sendJson(res, 400, { error: "invalid_report_name", message: "invalid report name" });
          return;
        }
        const fileName = parsedName.data;

        const reportPath = path.join(config.reportsDir, fileName);
        const parsed = await readAndParseReport(reportPath);
        sendJson(res, 200, { path: reportPath, report: parsed });
        return;
      }

      sendJson(res, 404, {
        error: "not_found",
        hint: "Check method/path (POST vs GET, trailing slash).",
        available: [
          "GET /health",
          "GET /reports",
          "GET /reports/latest",
          "GET /reports/<fileName>",
          "POST /analyze/once",
          "POST /analyze/away"
        ]
      });
    } catch (error) {
      const mapped = toApiErrorResponse(error);
      sendJson(res, mapped.status, mapped.body);
    }
  });
}

export async function startApiServer(): Promise<void> {
  const server = createApiServer();
  await new Promise<void>((resolve) => {
    server.listen(config.apiPort, config.apiHost, () => resolve());
  });
  // eslint-disable-next-line no-console
  console.log(`API listening on http://${config.apiHost}:${config.apiPort}`);
}