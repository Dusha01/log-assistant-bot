# log-assistant-bot
Nginx security log assistant bot (runs in Docker, cron-based).

## What it does now
- Recursively reads nginx logs from filesystem under `/var/log/nginx` (including vhost directories and `archived/`).
- Tails **only new bytes since last run** (no duplicate ingestion) using a checkpoint state file.
- Sends selected raw lines to AI analysis.
- Writes a **markdown report** (`.md`) to the project root and prints a short terminal summary.

## Environment variables
- `OPEN_AI_KEY` - API key for AI provider (required).
- `OPEN_AI_BASE_URL` - base URL for OpenAI-compatible API (default: `https://api.openai.com/v1`).
- `OPEN_AI_MODEL` - model name (default: `gpt-4o-mini`).
- `OPEN_AI_TIMEOUT_MS` - request timeout to AI provider in ms (default: `120000`).
- `NGINX_LOG_ROOT` - nginx log root directory (default: `/var/log/nginx`).
- `STATE_FILE_PATH` - path to checkpoint file (default: `<project>/.log-assistant.state.json`).
- `AWAY_STATE_FILE_PATH` - path to dedicated checkpoint file for `POST /analyze/away` (default: `<project>/.log-assistant-away.state.json`).
- `REPORTS_DIR` - where markdown reports are written (default: project root).
- `REPORT_PREFIX` - report filename prefix (default: `security-report`).
- `CRON_SCHEDULE` - cron expression for analysis schedule (default: `0 */2 * * *`).
- `REPORT_RETENTION_DAYS` - keep reports newer than this amount of days (default: `30`).
- `REPORT_CLEANUP_CRON` - optional cron expression for cleanup job. If empty, cleanup runs after each scheduled analysis.
- `MAX_LOG_LINES_PER_RUN` - max raw log lines sent to AI (default: `1000`).
- `MAX_LOG_BYTES_PER_RUN` - max bytes read per run across all files (default: `2000000`).
- `API_HOST` - API listen host (default: `0.0.0.0`).
- `API_PORT` - API listen port (default: `3010`).

## Run
```bash
npm install
npm run analyze:once
```

You can also run:
```bash
npm start
```

By default `npm start` runs in **cron mode** (every 2 hours).

## API
Run the API server:
```bash
npm run api
```

Endpoints:
- `GET /health`
- `GET /docs` - Swagger UI
- `GET /reports` - list available reports
- `GET /reports/latest` - latest report as JSON
- `GET /reports/<fileName>` - specific report as JSON
- `DELETE /reports/<fileName>` - delete specific markdown report
- `POST /analyze/once` - force analysis of new log bytes (checkpoint-based), returns latest report JSON
- `POST /analyze/away` - force analysis of only new log bytes tracked in dedicated away checkpoint, returns latest report JSON

### Docker notes
To persist checkpoints and reports between container restarts, mount the project directory (or at least `STATE_FILE_PATH` and `REPORTS_DIR`) as a volume.
