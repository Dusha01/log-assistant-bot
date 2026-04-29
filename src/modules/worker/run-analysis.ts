import { writeFile } from "node:fs/promises";
import path from "node:path";

import { config } from "../../core/config.js";
import { analyzeRawLogs, type AiSecurityReport } from "../ai/ai-client.js";
import {
  collectNewNginxLogsFromFs,
  type LogCollectionResult
} from "./log-source.js";
import { formatMarkdownReport } from "./markdown-report.js";
import { formatTerminalReport } from "./terminal-report.js";
import { readStateFile, writeStateFile } from "./state.js";

type RunOneShotDeps = {
  collectLogs?: () => Promise<LogCollectionResult>;
  analyzeLogs?: (rawLogs: string[]) => Promise<AiSecurityReport>;
  print?: (text: string) => void;
};

function safeTimestampForFilename(iso: string): string {
  return iso.replaceAll(":", "-");
}

export async function runOneShotAnalysis(deps: RunOneShotDeps = {}): Promise<void> {
  const collectLogs =
    deps.collectLogs ??
    (() =>
      collectNewNginxLogsFromFs({
        rootDir: config.nginxLogRoot,
        stateFilePath: config.stateFilePath,
        maxLines: config.maxLogLinesPerRun,
        maxBytes: config.maxLogBytesPerRun
      }));

  const analyzeLogs = deps.analyzeLogs ?? analyzeRawLogs;
  const print = deps.print ?? ((text: string) => console.log(text));

  const collected = await collectLogs();
  const meta = {
    windowStartIso: collected.meta.windowStartIso ?? null,
    windowEndIso: collected.meta.windowEndIso ?? new Date().toISOString(),
    filesConsidered: collected.meta.filesConsidered ?? 0,
    filesWithUpdates: collected.meta.filesWithUpdates ?? 0,
    selectedLines: collected.lines.length,
    droppedByLimit: collected.meta.droppedByLimit,
    bytesRead: collected.meta.bytesRead ?? 0
  };

  const report =
    collected.lines.length === 0
      ? ({
          suspicious: false,
          risk_level: "low",
          summary: "Нет новых строк логов для анализа за этот интервал.",
          findings: [],
          recommended_actions: ["Убедитесь, что бот имеет доступ к /var/log/nginx и что логи пишутся."]
        } satisfies AiSecurityReport)
      : await analyzeLogs(collected.lines);

  const markdown = formatMarkdownReport({ report, meta });
  const filename = `${config.reportPrefix}-${safeTimestampForFilename(meta.windowEndIso)}.md`;
  const reportPath = path.join(config.reportsDir, filename);
  await writeFile(reportPath, markdown, "utf8");

  // Store lastReportPath for convenience (best-effort).
  try {
    const state = await readStateFile(config.stateFilePath);
    state.lastReportPath = reportPath;
    await writeStateFile(config.stateFilePath, state);
  } catch {
    // ignore
  }

  const terminal = formatTerminalReport({
    report,
    meta: {
      lookbackHours: config.nginxLookbackHours,
      selectedLines: collected.lines.length,
      totalLines: collected.meta.totalLines,
      invalidTimestampLines: collected.meta.invalidTimestampLines
    }
  });

  if (collected.lines.length === 0) {
    print(
      `No new log lines found. Files considered: ${meta.filesConsidered}, bytes read: ${meta.bytesRead}.`
    );
  } else {
    print(terminal);
  }
  print("");
  print(`Markdown report written to: ${reportPath}`);
}

export async function runAwayAnalysis(deps: RunOneShotDeps = {}): Promise<void> {
  const collectLogs =
    deps.collectLogs ??
    (() =>
      collectNewNginxLogsFromFs({
        rootDir: config.nginxLogRoot,
        stateFilePath: config.awayStateFilePath,
        maxLines: config.maxLogLinesPerRun,
        maxBytes: config.maxLogBytesPerRun
      }));

  await runOneShotAnalysis({ ...deps, collectLogs });
}

