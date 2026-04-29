import { readFile, readdir, unlink } from "node:fs/promises";
import path from "node:path";

import { config } from "../../../core/config.js";
import { readStateFile, writeStateFile } from "../../worker/state.js";
import { parseSecurityMarkdown, type ParsedReport } from "../report-parser.js";

export type ReportRef = { name: string; path: string };
export type DeleteReportOptions = {
  reportsDir: string;
  reportPrefix: string;
  stateFilePath: string;
};

export class DeleteReportError extends Error {
  constructor(
    public readonly code: "invalid_name" | "not_found",
    message: string
  ) {
    super(message);
  }
}

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

function isSafeReportName(fileName: string, reportPrefix: string): boolean {
  if (!/^[A-Za-z0-9._-]+\.md$/.test(fileName)) return false;
  if (fileName.includes("..")) return false;
  if (!fileName.startsWith(`${reportPrefix}-`)) return false;
  return true;
}

export async function deleteReportByName(
  fileName: string,
  options: DeleteReportOptions = {
    reportsDir: config.reportsDir,
    reportPrefix: config.reportPrefix,
    stateFilePath: config.stateFilePath
  }
): Promise<{ deleted: true; path: string }> {
  if (!isSafeReportName(fileName, options.reportPrefix)) {
    throw new DeleteReportError("invalid_name", "invalid report name");
  }

  const fullPath = path.join(options.reportsDir, fileName);
  try {
    await unlink(fullPath);
  } catch {
    throw new DeleteReportError("not_found", "report not found");
  }

  try {
    const state = await readStateFile(options.stateFilePath);
    if (state.lastReportPath === fullPath) {
      state.lastReportPath = null;
      await writeStateFile(options.stateFilePath, state);
    }
  } catch {
    // ignore state update failures
  }

  return { deleted: true, path: fullPath };
}

