import { describe, it, expect } from "vitest";
import { formatTerminalReport } from "./terminal-report.js";
import type { AiSecurityReport } from "../ai/ai-client.js";

const baseReport: AiSecurityReport = {
  suspicious: false,
  riskLevel: "low",
  summary: "All clear.",
  findings: [],
  recommendedActions: [],
};

const baseMeta = {
  lookbackHours: 2,
  selectedLines: 150,
  totalLines: 200,
  invalidTimestampLines: 10,
};

describe("formatTerminalReport", () => {
  it("renders header block", () => {
    const out = formatTerminalReport({ report: baseReport, meta: baseMeta });
    expect(out).toContain("=== NGINX SECURITY ANALYSIS ===");
    expect(out).toContain("SUSPICIOUS ACTIVITY: NO");
    expect(out).toContain("RISK LEVEL: LOW");
    expect(out).toContain("LOOKBACK WINDOW: 2 hour(s)");
    expect(out).toContain("LOG LINES ANALYZED: 150 of 200");
    expect(out).toContain("INVALID TIMESTAMP LINES SKIPPED: 10");
  });

  it("renders SUSPICIOUS ACTIVITY: YES when suspicious", () => {
    const report = { ...baseReport, suspicious: true, riskLevel: "high" as const };
    const out = formatTerminalReport({ report, meta: baseMeta });
    expect(out).toContain("SUSPICIOUS ACTIVITY: YES");
    expect(out).toContain("RISK LEVEL: HIGH");
  });

  it("renders summary", () => {
    const out = formatTerminalReport({ report: baseReport, meta: baseMeta });
    expect(out).toContain("SUMMARY: All clear.");
  });

  it("renders no findings message when findings empty", () => {
    const out = formatTerminalReport({ report: baseReport, meta: baseMeta });
    expect(out).toContain("- No concrete attack patterns found");
  });

  it("renders findings with index, type, severity, details and evidence", () => {
    const report: AiSecurityReport = {
      ...baseReport,
      findings: [
        {
          type: "sql_injection",
          severity: "critical",
          details: "SQL injection attempt in query string",
          evidence: ["?id=1' OR 1=1--"],
        },
        {
          type: "xss",
          severity: "high",
          details: "Reflected XSS payload detected",
          evidence: [],
        },
      ],
    };
    const out = formatTerminalReport({ report, meta: baseMeta });
    expect(out).toContain("- [1] sql_injection (CRITICAL)");
    expect(out).toContain("  details: SQL injection attempt in query string");
    expect(out).toContain("    - ?id=1' OR 1=1--");
    expect(out).toContain("- [2] xss (HIGH)");
    expect(out).toContain("  details: Reflected XSS payload detected");
  });

  it("renders recommended actions", () => {
    const report: AiSecurityReport = {
      ...baseReport,
      recommendedActions: ["Enable rate limiting", "Update firewall rules"],
    };
    const out = formatTerminalReport({ report, meta: baseMeta });
    expect(out).toContain("RECOMMENDED ACTIONS:");
    expect(out).toContain("- Enable rate limiting");
    expect(out).toContain("- Update firewall rules");
  });

  it("renders no actions message when recommendedActions empty", () => {
    const out = formatTerminalReport({ report: baseReport, meta: baseMeta });
    expect(out).toContain("- No immediate actions");
  });
});
