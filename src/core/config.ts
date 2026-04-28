import path from "node:path";
import dotenv from "dotenv";

dotenv.config();
const env = process.env;

function readNumberEnv(value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return parsed;
}

export const config = {
  cronSchedule: "0 */2 * * *",
  nginxLogRoot: env.NGINX_LOG_ROOT ?? "/var/log/nginx",
  stateFilePath: env.STATE_FILE_PATH ?? path.join(process.cwd(), ".log-assistant.state.json"),
  reportsDir: env.REPORTS_DIR ?? process.cwd(),
  reportPrefix: env.REPORT_PREFIX ?? "security-report",

  // Legacy lookback-based mode (kept for backwards compatibility)
  nginxLogFilePath: env.NGINX_LOG_FILE_PATH ?? "/var/log/nginx/access.log",
  nginxLookbackHours: readNumberEnv(env.NGINX_LOOKBACK_HOURS, 2),

  maxLogLinesPerRun: readNumberEnv(env.MAX_LOG_LINES_PER_RUN, 1000),
  maxLogBytesPerRun: readNumberEnv(env.MAX_LOG_BYTES_PER_RUN, 2_000_000),

  openAIKey: env.OPEN_AI_KEY,
  openAIBaseUrl: env.OPEN_AI_BASE_URL ?? "https://api.openai.com/v1",
  openAIModel: env.OPEN_AI_MODEL ?? "gpt-4o-mini",
  openAITimeoutMs: readNumberEnv(env.OPEN_AI_TIMEOUT_MS, 120_000)
};