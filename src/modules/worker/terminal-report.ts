import type { AiSecurityReport } from "../ai/ai-client.js";

type ReportMeta = {
  lookbackHours: number;
  selectedLines: number;
  totalLines: number;
  invalidTimestampLines: number;
};

type FormatTerminalReportParams = {
  report: AiSecurityReport;
  meta: ReportMeta;
};

export function formatTerminalReport(params: FormatTerminalReportParams): string {
  const { report, meta } = params;
  const lines: string[] = [];

  lines.push("=== NGINX SECURITY ANALYSIS ===");
  lines.push(`SUSPICIOUS ACTIVITY: ${report.suspicious ? "YES" : "NO"}`);
  lines.push(`RISK LEVEL: ${report.riskLevel.toUpperCase()}`);
  lines.push(`LOOKBACK WINDOW: ${meta.lookbackHours} hour(s)`);
  lines.push(`LOG LINES ANALYZED: ${meta.selectedLines} of ${meta.totalLines}`);
  lines.push(`INVALID TIMESTAMP LINES SKIPPED: ${meta.invalidTimestampLines}`);
  lines.push("");
  lines.push(`SUMMARY: ${report.summary}`);
  lines.push("");

  lines.push("FINDINGS:");
  if (report.findings.length === 0) {
    lines.push("- No concrete attack patterns found");
  } else {
    report.findings.forEach((finding, index) => {
      lines.push(`- [${index + 1}] ${finding.type} (${finding.severity.toUpperCase()})`);
      lines.push(`  details: ${finding.details}`);
      if (finding.evidence.length > 0) {
        lines.push("  evidence:");
        finding.evidence.forEach((item) => lines.push(`    - ${item}`));
      }
    });
  }

  lines.push("");
  lines.push("RECOMMENDED ACTIONS:");
  if (report.recommendedActions.length === 0) {
    lines.push("- No immediate actions");
  } else {
    report.recommendedActions.forEach((action) => lines.push(`- ${action}`));
  }

  return lines.join("\n");
}
