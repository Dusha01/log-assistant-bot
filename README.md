# log-assistant-bot

Автоматический ассистент для анализа логов безопасности **nginx** с помощью AI (OpenAI-compatible API). Читает новые строки логов инкрементально, отправляет их на анализ и сохраняет отчёты в Markdown.

**Документация:**

| Язык | Файл |
|------|------|
| Русский | [README.ru.md](./README.ru.md) |
| English | [README.en.md](./README.en.md) |

## Быстрый старт

```bash
cp .env.example .env   # задайте OPEN_AI_KEY
npm install
npm run analyze:once   # разовый анализ
npm start              # cron-режим (по умолчанию каждые 2 часа)
npm run api            # HTTP API + Swagger UI
```

Docker:

```bash
cp Docker/.env.example Docker/.env   # задайте OPEN_AI_KEY
docker compose -f Docker/docker-compose.yml up -d
```

## Основные возможности

- Рекурсивное чтение `*.log` из `NGINX_LOG_ROOT` (vhost-каталоги, `archived/` и т.д.)
- Инкрементальное чтение **только новых байт** с checkpoint-файлом (без дублирования)
- AI-анализ подозрительной активности (сканирование, path traversal, RCE и др.)
- Markdown-отчёты и краткая сводка в терминал
- Cron-планировщик, очистка старых отчётов, REST API

Подробности — в [README.ru.md](./README.ru.md) или [README.en.md](./README.en.md).
