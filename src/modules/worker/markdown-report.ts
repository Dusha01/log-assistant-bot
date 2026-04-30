import type { AiSecurityReport } from "../ai/ai-client.js";

export type MarkdownMeta = {
  windowStartIso: string | null;
  windowEndIso: string;
  filesConsidered: number;
  filesWithUpdates: number;
  selectedLines: number;
  droppedByLimit: number;
  bytesRead: number;
};

export function formatMarkdownReport(params: { report: AiSecurityReport; meta: MarkdownMeta }): string {
  const { report, meta } = params;
  const lines: string[] = [];

  lines.push(`# nginx security report`);
  lines.push(`window: ${meta.windowStartIso ?? "first-run"} -> ${meta.windowEndIso}`);
  lines.push(
    `files: ${meta.filesWithUpdates}/${meta.filesConsidered} updated, bytes_read=${meta.bytesRead}, lines=${meta.selectedLines} (dropped=${meta.droppedByLimit})`
  );
  lines.push(`suspicious: ${report.suspicious ? "yes" : "no"}, risk_level: ${report.riskLevel}`);
  lines.push("");

  if (report.summary.trim().length > 0) {
    lines.push(report.summary.trim());
    lines.push("");
  }

  if (report.findings.length === 0) {
    lines.push(`no_findings: true`);
  } else {
    report.findings.forEach((finding, idx) => {
      const evidence = finding.evidence.length > 0 ? ` | evidence: ${finding.evidence.join(" | ")}` : "";
      lines.push(
        `${idx + 1}. [${finding.severity}] ${finding.type}: ${finding.details}${evidence}`.trim()
      );
    });
  }

  lines.push("");
  lines.push("recommended_actions:");
  if (report.recommendedActions.length === 0) {
    lines.push("1. Нет немедленных действий.");
  } else {
    report.recommendedActions.forEach((a, idx) => lines.push(`${idx + 1}. ${a}`));
  }
  lines.push("");

  return lines.join("\n");
}