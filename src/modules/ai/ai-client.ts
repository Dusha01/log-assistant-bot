import axios from "axios";
import { config } from "../../core/config.js";

export type AiSecurityFinding = {
  type: string;
  severity: "low" | "medium" | "high" | "critical";
  details: string;
  evidence: string[];
};

export type AiSecurityReport = {
  suspicious: boolean;
  risk_level: "low" | "medium" | "high" | "critical";
  summary: string;
  findings: AiSecurityFinding[];
  recommended_actions: string[];
};

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


function parseStructuredContent(content: unknown): AiSecurityReport {
  if (typeof content === "string") {
    return JSON.parse(content) as AiSecurityReport;
  }

  if (typeof content === "object" && content !== null) {
    return content as AiSecurityReport;
  }

  throw new Error("OpenRouter returned unsupported message content format");
}

export async function analyzeRawLogs(rawLogs: string[]): Promise<AiSecurityReport> {
  if (!config.openAIKey) {
    throw new Error("OPENROUTER_API_KEY is required for AI analysis");
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
        timeout: 60_000
      }
    );
  } catch (error) {
    if (axios.isAxiosError(error)) {
      const status = error.response?.status ?? "unknown";
      const message = error.response?.data?.error?.message ?? error.message;
      throw new Error(`OpenRouter request failed (${status}): ${message}`);
    }
    throw error;
  }

  const content = response.data?.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error("OpenRouter returned empty structured response");
  }

  return parseStructuredContent(content);
}