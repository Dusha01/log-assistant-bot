import { describe, it, expect } from "vitest";
import { parseSecurityMarkdown } from "./report-parser.js";

const sampleMarkdown = `# nginx security report
window: 2026-05-24T12:00:00.000Z -> 2026-05-24T14:00:00.000Z
files: 3/11 updated, bytes_read=45231, lines=280 (dropped=0)
suspicious: yes, risk_level: high

Multiple path traversal and scanner attempts detected from several IPs.

1. [critical] path_traversal: Directory traversal attempts | evidence: GET /../../../etc/passwd | GET /../../etc/shadow
2. [medium] scanner: Nikto scanner detected | evidence: Nikto/2.1.6
3. [low] info_disclosure: Server version disclosed | evidence: Server: nginx/1.18.0

recommended_actions:
1. Block offending IPs at firewall
2. Enable WAF rules for path traversal
3. Hide nginx version string
`;

describe("parseSecurityMarkdown", () => {
  it("parses window range", () => {
    const report = parseSecurityMarkdown(sampleMarkdown);
    expect(report.windowStart).toBe("2026-05-24T12:00:00.000Z");
    expect(report.windowEnd).toBe("2026-05-24T14:00:00.000Z");
  });

  it("parses first-run window", () => {
    const md = `# nginx security report
window: first-run -> 2026-05-24T14:00:00.000Z
files: 0/0 updated, bytes_read=0, lines=0 (dropped=0)
suspicious: no, risk_level: low

All good.`;
    const report = parseSecurityMarkdown(md);
    expect(report.windowStart).toBeNull();
    expect(report.windowEnd).toBe("2026-05-24T14:00:00.000Z");
  });

  it("parses files metadata", () => {
    const report = parseSecurityMarkdown(sampleMarkdown);
    expect(report.filesUpdated).toBe(3);
    expect(report.filesConsidered).toBe(11);
    expect(report.bytesRead).toBe(45231);
    expect(report.lines).toBe(280);
    expect(report.dropped).toBe(0);
  });

  it("parses suspicious and risk level", () => {
    const report = parseSecurityMarkdown(sampleMarkdown);
    expect(report.suspicious).toBe(true);
    expect(report.riskLevel).toBe("high");
  });

  it("parses summary text", () => {
    const report = parseSecurityMarkdown(sampleMarkdown);
    expect(report.summary).toContain("Multiple path traversal and scanner attempts");
  });

  it("parses findings with severity, type, details, evidence", () => {
    const report = parseSecurityMarkdown(sampleMarkdown);
    expect(report.findings).toHaveLength(3);

    expect(report.findings[0]).toMatchObject({
      severity: "critical",
      type: "path_traversal",
      details: "Directory traversal attempts",
      evidence: ["GET /../../../etc/passwd", "GET /../../etc/shadow"],
    });

    expect(report.findings[1]).toMatchObject({
      severity: "medium",
      type: "scanner",
      details: "Nikto scanner detected",
      evidence: ["Nikto/2.1.6"],
    });

    expect(report.findings[2]).toMatchObject({
      severity: "low",
      type: "info_disclosure",
      details: "Server version disclosed",
      evidence: ["Server: nginx/1.18.0"],
    });
  });

  it("parses recommended actions", () => {
    const report = parseSecurityMarkdown(sampleMarkdown);
    expect(report.recommendedActions).toEqual([
      "Block offending IPs at firewall",
      "Enable WAF rules for path traversal",
      "Hide nginx version string",
    ]);
  });

  it("handles no_findings marker", () => {
    const md = `# nginx security report
window: 2026-05-24T12:00:00.000Z -> 2026-05-24T14:00:00.000Z
files: 0/11 updated, bytes_read=0, lines=0 (dropped=0)
suspicious: no, risk_level: low

No issues found.

no_findings: true

recommended_actions:
1. No action needed
`;
    const report = parseSecurityMarkdown(md);
    expect(report.findings).toHaveLength(0);
    expect(report.recommendedActions).toEqual(["No action needed"]);
  });

  it("preserves raw markdown", () => {
    const report = parseSecurityMarkdown(sampleMarkdown);
    expect(report.rawMarkdown).toBe(sampleMarkdown);
  });

  it("handles empty markdown gracefully", () => {
    const report = parseSecurityMarkdown("");
    expect(report.windowStart).toBeNull();
    expect(report.windowEnd).toBeNull();
    expect(report.suspicious).toBeNull();
    expect(report.riskLevel).toBeNull();
    expect(report.findings).toHaveLength(0);
    expect(report.recommendedActions).toHaveLength(0);
    expect(report.summary).toBe("");
  });
});
