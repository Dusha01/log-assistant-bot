import { describe, it, expect } from "vitest";
import { parseAiSecurityReport } from "./ai-client.js";

describe("parseAiSecurityReport", () => {
  const validWire = {
    suspicious: true,
    risk_level: "high",
    summary: "Detected attack patterns.",
    findings: [
      {
        type: "path_traversal",
        severity: "critical",
        details: "Directory traversal attempt",
        evidence: ["GET /../../../etc/passwd"],
      },
    ],
    recommended_actions: ["Block IP", "Enable WAF"],
  };

  it("parses valid wire format", () => {
    const report = parseAiSecurityReport(validWire);
    expect(report.suspicious).toBe(true);
    expect(report.riskLevel).toBe("high");
    expect(report.summary).toBe("Detected attack patterns.");
    expect(report.findings).toHaveLength(1);
    expect(report.findings[0]).toMatchObject({
      type: "path_traversal",
      severity: "critical",
      details: "Directory traversal attempt",
      evidence: ["GET /../../../etc/passwd"],
    });
    expect(report.recommendedActions).toEqual(["Block IP", "Enable WAF"]);
  });

  it("parses from JSON string", () => {
    const report = parseAiSecurityReport(JSON.stringify(validWire));
    expect(report.suspicious).toBe(true);
    expect(report.riskLevel).toBe("high");
  });

  it("maps risk_level to riskLevel", () => {
    const wire = { ...validWire, risk_level: "critical" as const };
    const report = parseAiSecurityReport(wire);
    expect(report.riskLevel).toBe("critical");
  });

  it("maps recommended_actions to recommendedActions", () => {
    const wire = { ...validWire, recommended_actions: ["Do nothing"] };
    const report = parseAiSecurityReport(wire);
    expect(report.recommendedActions).toEqual(["Do nothing"]);
  });

  it("handles empty findings", () => {
    const wire = { ...validWire, findings: [] };
    const report = parseAiSecurityReport(wire);
    expect(report.findings).toHaveLength(0);
  });

  it("throws on missing required fields", () => {
    expect(() => parseAiSecurityReport({})).toThrow();
    expect(() => parseAiSecurityReport({ suspicious: true })).toThrow();
  });

  it("throws on invalid risk_level", () => {
    const wire = { ...validWire, risk_level: "extreme" };
    expect(() => parseAiSecurityReport(wire)).toThrow();
  });

  it("throws on invalid finding severity", () => {
    const wire = {
      ...validWire,
      findings: [
        { type: "xss", severity: "fatal", details: "xss", evidence: [] },
      ],
    };
    expect(() => parseAiSecurityReport(wire)).toThrow();
  });

  it("throws on non-object input", () => {
    expect(() => parseAiSecurityReport(42)).toThrow();
    expect(() => parseAiSecurityReport(null)).toThrow();
  });
});
