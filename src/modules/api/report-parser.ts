export type ParsedFinding = {
  severity: "low" | "medium" | "high" | "critical";
  type: string;
  details: string;
  evidence: string[];
  raw: string;
};

export type ParsedReport = {
  windowStart: string | null;
  windowEnd: string | null;
  filesUpdated: number | null;
  filesConsidered: number | null;
  bytesRead: number | null;
  lines: number | null;
  dropped: number | null;
  suspicious: boolean | null;
  riskLevel: "low" | "medium" | "high" | "critical" | null;
  summary: string;
  findings: ParsedFinding[];
  recommendedActions: string[];
  rawMarkdown: string;
};

function toInt(value: string | undefined): number | null {
  if (!value) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function parseSecurityMarkdown(markdown: string): ParsedReport {
  const lines = markdown.split(/\r?\n/);

  let windowStart: string | null = null;
  let windowEnd: string | null = null;
  let filesUpdated: number | null = null;
  let filesConsidered: number | null = null;
  let bytesRead: number | null = null;
  let linesCount: number | null = null;
  let dropped: number | null = null;
  let suspicious: boolean | null = null;
  let riskLevel: ParsedReport["riskLevel"] = null;

  const findings: ParsedFinding[] = [];
  const recommendedActions: string[] = [];
  const summaryParts: string[] = [];

  let i = 0;
  // header-ish metadata (best-effort)
  for (; i < Math.min(lines.length, 10); i++) {
    const l = lines[i].trim();
    if (l.startsWith("window:")) {
      const m = l.match(/^window:\s*(.+?)\s*->\s*(.+)\s*$/);
      if (m) {
        windowStart = m[1] === "first-run" ? null : m[1];
        windowEnd = m[2];
      }
      continue;
    }
    if (l.startsWith("files:")) {
      const m = l.match(
        /^files:\s*([0-9]+)\/([0-9]+)\s+updated,\s+bytes_read=([0-9]+),\s+lines=([0-9]+)\s+\(dropped=([0-9]+)\)\s*$/
      );
      if (m) {
        filesUpdated = toInt(m[1]);
        filesConsidered = toInt(m[2]);
        bytesRead = toInt(m[3]);
        linesCount = toInt(m[4]);
        dropped = toInt(m[5]);
      }
      continue;
    }
    if (l.startsWith("suspicious:")) {
      const m = l.match(/^suspicious:\s*(yes|no),\s*risk_level:\s*(low|medium|high|critical)\s*$/);
      if (m) {
        suspicious = m[1] === "yes";
        riskLevel = m[2] as ParsedReport["riskLevel"];
      }
      continue;
    }
    if (l === "") {
      i++;
      break;
    }
  }

  // summary until we hit findings/no_findings/recommended_actions
  for (; i < lines.length; i++) {
    const l = lines[i];
    const t = l.trim();
    if (t === "") {
      // keep one blank as summary separator
      if (summaryParts.length > 0 && summaryParts[summaryParts.length - 1] !== "") {
        summaryParts.push("");
      }
      continue;
    }
    if (t === "no_findings: true" || /^[0-9]+\.\s*\[(low|medium|high|critical)\]\s+/.test(t) || t === "recommended_actions:") {
      break;
    }
    summaryParts.push(l);
  }

  // findings
  for (; i < lines.length; i++) {
    const t = lines[i].trim();
    if (t === "") continue;
    if (t === "no_findings: true") {
      continue;
    }
    if (t === "recommended_actions:") {
      i++;
      break;
    }

    const m = t.match(/^[0-9]+\.\s*\[(low|medium|high|critical)\]\s+(.+?):\s*(.+?)(?:\s*\|\s*evidence:\s*(.+))?$/);
    if (!m) {
      continue;
    }
    const severity = m[1] as ParsedFinding["severity"];
    const type = m[2].trim();
    const details = m[3].trim();
    const evidenceRaw = (m[4] ?? "").trim();
    const evidence = evidenceRaw.length > 0 ? evidenceRaw.split(/\s*\|\s*/).filter(Boolean) : [];
    findings.push({ severity, type, details, evidence, raw: t });
  }

  // recommended actions
  for (; i < lines.length; i++) {
    const t = lines[i].trim();
    if (t === "") continue;
    const m = t.match(/^[0-9]+\.\s*(.+)$/);
    if (m) recommendedActions.push(m[1].trim());
  }

  const summary = summaryParts.join("\n").trim();

  return {
    windowStart,
    windowEnd,
    filesUpdated,
    filesConsidered,
    bytesRead,
    lines: linesCount,
    dropped,
    suspicious,
    riskLevel,
    summary,
    findings,
    recommendedActions,
    rawMarkdown: markdown
  };
}

