import { describe, it, expect } from "vitest";
import { formatMarkdownReport } from "./markdown-report.js";
import type { AiSecurityReport } from "../ai/ai-client.js";
import type { MarkdownMeta } from "./markdown-report.js";

const baseReport: AiSecurityReport = {
  suspicious: false,
  riskLevel: "low",
  summary: "No suspicious activity detected.",
  findings: [],
  recommendedActions: [],
};

const baseMeta: MarkdownMeta = {
  windowStartIso: "2026-05-24T12:00:00.000Z",
  windowEndIso: "2026-05-24T14:00:00.000Z",
  filesConsidered: 11,
  filesWithUpdates: 3,
  selectedLines: 280,
  droppedByLimit: 0,
  bytesRead: 45231,
};

describe("formatMarkdownReport", () => {
  it("renders header with window range", () => {
    const md = formatMarkdownReport({ report: baseReport, meta: baseMeta });
    expect(md).toContain("window: 2026-05-24T12:00:00.000Z -> 2026-05-24T14:00:00.000Z");
  });

  it("renders first-run when windowStartIso is null", () => {
    const meta = { ...baseMeta, windowStartIso: null };
    const md = formatMarkdownReport({ report: baseReport, meta });
    expect(md).toContain("window: first-run ->");
  });

  it("renders files stats", () => {
    const md = formatMarkdownReport({ report: baseReport, meta: baseMeta });
    expect(md).toContain("files: 3/11 updated, bytes_read=45231, lines=280 (dropped=0)");
  });

  it("renders suspicious=no for non-suspicious report", () => {
    const md = formatMarkdownReport({ report: baseReport, meta: baseMeta });
    expect(md).toContain("suspicious: no, risk_level: low");
  });

  it("renders suspicious=yes for suspicious report", () => {
    const report = { ...baseReport, suspicious: true, riskLevel: "high" as const };
    const md = formatMarkdownReport({ report, meta: baseMeta });
    expect(md).toContain("suspicious: yes, risk_level: high");
  });

  it("renders summary", () => {
    const md = formatMarkdownReport({ report: baseReport, meta: baseMeta });
    expect(md).toContain("No suspicious activity detected.");
  });

  it("renders no_findings when findings are empty", () => {
    const md = formatMarkdownReport({ report: baseReport, meta: baseMeta });
    expect(md).toContain("no_findings: true");
  });

  it("renders findings with severity, type, details and evidence", () => {
    const report: AiSecurityReport = {
      ...baseReport,
      suspicious: true,
      riskLevel: "critical",
      findings: [
        {
          type: "path_traversal",
          severity: "critical",
          details: "Detected directory traversal attempts",
          evidence: ["GET /../../../etc/passwd", "GET /../../etc/shadow"],
        },
        {
          type: "scanner",
          severity: "medium",
          details: "Known scanner User-Agent",
          evidence: ["Nikto"],
        },
      ],
    };
    const md = formatMarkdownReport({ report, meta: baseMeta });
    expect(md).toContain("1. [critical] path_traversal: Detected directory traversal attempts | evidence: GET /../../../etc/passwd | GET /../../etc/shadow");
    expect(md).toContain("2. [medium] scanner: Known scanner User-Agent | evidence: Nikto");
  });

  it("renders finding without evidence when evidence is empty", () => {
    const report: AiSecurityReport = {
      ...baseReport,
      findings: [
        {
          type: "rce",
          severity: "high",
          details: "Remote code execution attempt",
          evidence: [],
        },
      ],
    };
    const md = formatMarkdownReport({ report, meta: baseMeta });
    expect(md).toContain("1. [high] rce: Remote code execution attempt");
    expect(md).not.toContain("evidence:");
  });

  it("renders recommended_actions section", () => {
    const report: AiSecurityReport = {
      ...baseReport,
      recommendedActions: ["Block IP 1.2.3.4", "Review WAF rules"],
    };
    const md = formatMarkdownReport({ report, meta: baseMeta });
    expect(md).toContain("recommended_actions:");
    expect(md).toContain("1. Block IP 1.2.3.4");
    expect(md).toContain("2. Review WAF rules");
  });

  it("renders default message when recommendedActions is empty", () => {
    const md = formatMarkdownReport({ report: baseReport, meta: baseMeta });
    expect(md).toContain("1. Нет немедленных действий.");
  });
});
