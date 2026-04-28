import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

import { config } from "../../../core/config.js";
import { readStateFile } from "../../worker/state.js";
import { parseSecurityMarkdown, type ParsedReport } from "../report-parser.js";

export type ReportRef = { name: string; path: string };

export async function listReportFiles(): Promise<ReportRef[]> {
  const entries = await readdir(config.reportsDir, { withFileTypes: true });
  const names = entries
    .filter((e) => e.isFile())
    .map((e) => e.name)
    .filter((name) => name.startsWith(`${config.reportPrefix}-`) && name.endsWith(".md"))
    .sort((a, b) => b.localeCompare(a));

  return names.map((name) => ({ name, path: path.join(config.reportsDir, name) }));
}

export async function resolveLatestReportPath(): Promise<string | null> {
  try {
    const state = await readStateFile(config.stateFilePath);
    if (state.lastReportPath) return state.lastReportPath;
  } catch {
    // ignore
  }

  const list = await listReportFiles();
  return list.length > 0 ? list[0].path : null;
}

export async function readAndParseReportByPath(filePath: string): Promise<ParsedReport> {
  const raw = await readFile(filePath, "utf8");
  return parseSecurityMarkdown(raw);
}

