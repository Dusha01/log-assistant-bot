import axios from "axios";
import { z } from "zod";
import { config } from "../../core/config.js";

export type AiSecurityFinding = {
  type: string;
  severity: "low" | "medium" | "high" | "critical";
  details: string;
  evidence: string[];
};

export type AiSecurityReport = {
  suspicious: boolean;
  riskLevel: "low" | "medium" | "high" | "critical";
  summary: string;
  findings: AiSecurityFinding[];
  recommendedActions: string[];
};

type AiSecurityReportWire = {
  suspicious: boolean;
  risk_level: "low" | "medium" | "high" | "critical";
  summary: string;
  findings: AiSecurityFinding[];
  recommended_actions: string[];
};

const AiSecurityFindingSchema = z.object({
  type: z.string(),
  severity: z.enum(["low", "medium", "high", "critical"]),
  details: z.string(),
  evidence: z.array(z.string())
});

const AiSecurityReportWireSchema = z.object({
  suspicious: z.boolean(),
  risk_level: z.enum(["low", "medium", "high", "critical"]),
  summary: z.string(),
  findings: z.array(AiSecurityFindingSchema),
  recommended_actions: z.array(z.string())
});

const schema = {
  name: "services_security_report",
  strict: true,
  schema: {
    type: "object",
    properties: {
      suspicious: { type: "boolean" },
      risk_level: { type: "string", enum: ["low", "medium", "high", "critical"] },
      summary: { type: "string" },
      findings: {
        type: "array",
        items: {
          type: "object",
          properties: {
            type: { type: "string" },
            severity: { type: "string", enum: ["low", "medium", "high", "critical"] },
            details: { type: "string" },
            evidence: {
              type: "array",
              items: { type: "string" }
            }
          },
          required: ["type", "severity", "details", "evidence"],
          additionalProperties: false
        }
      },
      recommended_actions: {
        type: "array",
        items: { type: "string" }
      }
    },
    required: ["suspicious", "risk_level", "summary", "findings", "recommended_actions"],
    additionalProperties: false
  }
} as const;


export function parseAiSecurityReport(content: unknown): AiSecurityReport {
  let parsedContent: unknown = content;
  if (typeof content === "string") {
    parsedContent = JSON.parse(content);
  }

  const parsedResult = AiSecurityReportWireSchema.safeParse(parsedContent);
  if (!parsedResult.success) {
    throw new Error("AI provider returned malformed structured response");
  }
  const wireReport: AiSecurityReportWire = parsedResult.data;

  return {
    suspicious: wireReport.suspicious,
    riskLevel: wireReport.risk_level,
    summary: wireReport.summary,
    findings: wireReport.findings,
    recommendedActions: wireReport.recommended_actions
  };
}

export async function analyzeRawLogs(rawLogs: string[]): Promise<AiSecurityReport> {
  if (!config.openAIKey) {
    throw new Error("AI provider is required for AI analysis");
  }

  const logsBlock = rawLogs.join("\n");
  let response;
  try {
    response = await axios.post(
      `${config.openAIBaseUrl}/chat/completions`,
      {
        model: config.openAIModel,
        messages: [
          {
            role: "system",
            content:
              "Ты анализатор логов безопасности. Определи подозрительную активность в сырых логах nginx. Возвращай только результат по схеме JSON."
          },
          {
            role: "user",
            content:
              `Проанализируй логи сервера, проверь на подозрительную активность.\n` +
              `Логи (сырые строки, без обработки):\n${logsBlock}`
          }
        ],
        response_format: {
          type: "json_schema",
          json_schema: schema
        },
        temperature: 0.1
      },
      {
        headers: {
          Authorization: `Bearer ${config.openAIKey}`,
          "Content-Type": "application/json"
        },
        timeout: config.openAITimeoutMs
      }
    );
  } catch (error) {
    if (axios.isAxiosError(error)) {
      const status = error.response?.status ?? "unknown";
      const message = error.response?.data?.error?.message ?? error.message;
      throw new Error(`AI provider request failed (${status}): ${message}`);
    }
    throw error;
  }

  const content = response.data?.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error("AI provider returned empty structured response");
  }

  return parseAiSecurityReport(content);
}