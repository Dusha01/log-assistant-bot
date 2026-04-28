import { open, readFile, stat } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";

import { discoverNginxLogFiles } from "./log-discovery.js";
import { readStateFile, writeStateFile, type BotState, type FileCheckpoint } from "./state.js";

const execFileAsync = promisify(execFile);

const NGINX_TIMESTAMP_REGEX = /\[([0-9]{2}\/[A-Za-z]{3}\/[0-9]{4}:[0-9]{2}:[0-9]{2}:[0-9]{2} [+\-][0-9]{4})\]/;
const MONTHS: Record<string, number> = {
  Jan: 0,
  Feb: 1,
  Mar: 2,
  Apr: 3,
  May: 4,
  Jun: 5,
  Jul: 6,
  Aug: 7,
  Sep: 8,
  Oct: 9,
  Nov: 10,
  Dec: 11
};

export type LogCollectionOptions = {
  filePath: string;
  lookbackHours: number;
  maxLines: number;
  now?: Date;
};

export type DockerLogCollectionOptions = {
  containerName: string;
  lookbackHours: number;
  maxLines: number;
  runCommand?: (command: string, args: string[]) => Promise<string>;
};

export type FsTailCollectionOptions = {
  rootDir: string;
  stateFilePath: string;
  maxLines: number;
  maxBytes: number;
  now?: Date;
};

export type FsAwayCollectionOptions = {
  rootDir: string;
  perFileLines: number;
  maxBytesPerFile: number;
  maxLinesTotal: number;
  now?: Date;
};

export type LogCollectionResult = {
  lines: string[];
  meta: {
    totalLines: number;
    parsedTimestampLines: number;
    invalidTimestampLines: number;
    selectedBeforeLimit: number;
    droppedByLimit: number;
    filesConsidered?: number;
    filesWithUpdates?: number;
    bytesRead?: number;
    windowStartIso?: string | null;
    windowEndIso?: string;
  };
};

function parseRawLines(rawContent: string): string[] {
  return rawContent
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

function splitPreservingLeftover(input: string): { lines: string[]; leftover: string | null } {
  const parts = input.split(/\r?\n/);
  if (input.endsWith("\n") || input.endsWith("\r\n")) {
    return { lines: parts.filter((p) => p.trim().length > 0), leftover: null };
  }

  const leftover = parts.pop() ?? "";
  return {
    lines: parts.filter((p) => p.trim().length > 0),
    leftover: leftover.length > 0 ? leftover : null
  };
}

function getInodeNumber(stats: Awaited<ReturnType<typeof stat>>): number | null {
  const ino = (stats as unknown as { ino?: unknown }).ino;
  return typeof ino === "number" && Number.isFinite(ino) ? ino : null;
}

function shouldResetCheckpoint(prev: FileCheckpoint | undefined, inode: number | null, size: number): boolean {
  if (!prev) {
    return true;
  }
  if (prev.inode !== null && inode !== null && prev.inode !== inode) {
    return true;
  }
  if (size < prev.offset) {
    return true;
  }
  return false;
}

async function tailLastLinesFromFile(params: {
  filePath: string;
  lines: number;
  maxBytes: number;
}): Promise<{ lines: string[]; bytesRead: number }> {
  let stats;
  try {
    stats = await stat(params.filePath);
  } catch {
    return { lines: [], bytesRead: 0 };
  }

  const size = stats.size;
  if (size <= 0) {
    return { lines: [], bytesRead: 0 };
  }

  const fd = await open(params.filePath, "r");
  try {
    let bytesToRead = Math.min(size, Math.max(4 * 1024, params.maxBytes));

    while (true) {
      const start = Math.max(0, size - bytesToRead);
      const len = size - start;

      const buffer = Buffer.allocUnsafe(len);
      const { bytesRead } = await fd.read(buffer, 0, len, start);
      const content = buffer.subarray(0, bytesRead).toString("utf8");

      const rawLines = content.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
      if (rawLines.length >= params.lines + 1 || bytesToRead >= params.maxBytes || start === 0) {
        const last = rawLines.slice(Math.max(0, rawLines.length - params.lines));
        return { lines: last, bytesRead };
      }

      bytesToRead = Math.min(params.maxBytes, bytesToRead * 2);
    }
  } finally {
    await fd.close();
  }
}

function parseNginxTimestamp(raw: string): Date | null {
  const match = raw.match(NGINX_TIMESTAMP_REGEX);
  if (!match) {
    return null;
  }

  const value = match[1];
  const dateMatch = value.match(
    /^([0-9]{2})\/([A-Za-z]{3})\/([0-9]{4}):([0-9]{2}):([0-9]{2}):([0-9]{2}) ([+\-])([0-9]{2})([0-9]{2})$/
  );
  if (!dateMatch) {
    return null;
  }

  const [, dayRaw, monthRaw, yearRaw, hourRaw, minuteRaw, secondRaw, sign, tzHourRaw, tzMinuteRaw] =
    dateMatch;
  const month = MONTHS[monthRaw];
  if (month === undefined) {
    return null;
  }

  const day = Number(dayRaw);
  const year = Number(yearRaw);
  const hour = Number(hourRaw);
  const minute = Number(minuteRaw);
  const second = Number(secondRaw);
  const tzHour = Number(tzHourRaw);
  const tzMinute = Number(tzMinuteRaw);
  const offsetMinutes = tzHour * 60 + tzMinute;
  const direction = sign === "+" ? 1 : -1;

  const utcMs = Date.UTC(year, month, day, hour, minute, second) - direction * offsetMinutes * 60_000;
  const date = new Date(utcMs);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date;
}

export async function collectRecentNginxLogs(options: LogCollectionOptions): Promise<LogCollectionResult> {
  const now = options.now ?? new Date();
  const fromTime = now.getTime() - options.lookbackHours * 60 * 60 * 1000;
  const rawContent = await readFile(options.filePath, "utf8");
  const rawLines = parseRawLines(rawContent);

  const selected: string[] = [];
  let parsedTimestampLines = 0;
  let invalidTimestampLines = 0;

  for (const line of rawLines) {
    const timestamp = parseNginxTimestamp(line);
    if (!timestamp) {
      invalidTimestampLines += 1;
      continue;
    }

    parsedTimestampLines += 1;
    if (timestamp.getTime() >= fromTime && timestamp.getTime() <= now.getTime()) {
      selected.push(line);
    }
  }

  const selectedBeforeLimit = selected.length;
  const lines =
    selected.length <= options.maxLines ? selected : selected.slice(selected.length - options.maxLines);

  return {
    lines,
    meta: {
      totalLines: rawLines.length,
      parsedTimestampLines,
      invalidTimestampLines,
      selectedBeforeLimit,
      droppedByLimit: selectedBeforeLimit - lines.length
    }
  };
}

export async function collectRecentNginxLogsFromDocker(
  options: DockerLogCollectionOptions
): Promise<LogCollectionResult> {
  const runner =
    options.runCommand ??
    (async (command: string, args: string[]) => {
      const { stdout, stderr } = await execFileAsync(command, args, { maxBuffer: 10 * 1024 * 1024 });
      return [stdout, stderr].filter(Boolean).join("\n");
    });

  let rawOutput: string;
  try {
    rawOutput = await runner("docker", ["logs", "--since", `${options.lookbackHours}h`, options.containerName]);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to read logs from docker container '${options.containerName}': ${message}`);
  }
  const rawLines = parseRawLines(rawOutput);
  const selectedBeforeLimit = rawLines.length;
  const lines =
    rawLines.length <= options.maxLines ? rawLines : rawLines.slice(rawLines.length - options.maxLines);

  return {
    lines,
    meta: {
      totalLines: rawLines.length,
      parsedTimestampLines: rawLines.length,
      invalidTimestampLines: 0,
      selectedBeforeLimit,
      droppedByLimit: selectedBeforeLimit - lines.length
    }
  };
}

export async function collectNewNginxLogsFromFs(options: FsTailCollectionOptions): Promise<LogCollectionResult> {
  const now = options.now ?? new Date();

  const state: BotState = await readStateFile(options.stateFilePath);
  const windowStartIso = state.lastRunAt;
  const windowEndIso = now.toISOString();

  const files = await discoverNginxLogFiles({ rootDir: options.rootDir });

  const selected: string[] = [];
  let bytesBudget = options.maxBytes;
  let bytesRead = 0;
  let filesWithUpdates = 0;

  for (const filePath of files) {
    if (bytesBudget <= 0) {
      break;
    }

    let stats;
    try {
      stats = await stat(filePath);
    } catch {
      continue;
    }

    const size = stats.size;
    const inode = getInodeNumber(stats);
    const prev = state.files[filePath];
    const reset = shouldResetCheckpoint(prev, inode, size);

    const startOffset = reset ? 0 : prev.offset;
    const leftoverPrefix = reset ? null : prev.leftover;

    if (size <= startOffset) {
      state.files[filePath] = {
        inode,
        offset: startOffset,
        leftover: leftoverPrefix ?? null,
        lastReadAt: windowEndIso
      };
      continue;
    }

    const bytesToRead = Math.min(size - startOffset, bytesBudget);
    if (bytesToRead <= 0) {
      break;
    }

    const fd = await open(filePath, "r");
    try {
      const buffer = Buffer.allocUnsafe(bytesToRead);
      const { bytesRead: n } = await fd.read(buffer, 0, bytesToRead, startOffset);
      if (n <= 0) {
        continue;
      }

      bytesRead += n;
      bytesBudget -= n;

      const chunk = buffer.subarray(0, n).toString("utf8");
      const combined = (leftoverPrefix ?? "") + chunk;
      const split = splitPreservingLeftover(combined);

      if (split.lines.length > 0) {
        filesWithUpdates += 1;
      }

      const label = `[${path.relative(options.rootDir, filePath)}]`;
      for (const line of split.lines) {
        selected.push(`${label} ${line.trim()}`);
      }

      state.files[filePath] = {
        inode,
        offset: startOffset + n,
        leftover: split.leftover,
        lastReadAt: windowEndIso
      };
    } finally {
      await fd.close();
    }
  }

  state.lastRunAt = windowEndIso;
  await writeStateFile(options.stateFilePath, state);

  const selectedBeforeLimit = selected.length;
  const lines =
    selected.length <= options.maxLines ? selected : selected.slice(selected.length - options.maxLines);

  return {
    lines,
    meta: {
      totalLines: selectedBeforeLimit,
      parsedTimestampLines: selectedBeforeLimit,
      invalidTimestampLines: 0,
      selectedBeforeLimit,
      droppedByLimit: selectedBeforeLimit - lines.length,
      filesConsidered: files.length,
      filesWithUpdates,
      bytesRead,
      windowStartIso,
      windowEndIso
    }
  };
}

export async function collectAwayNginxLogsFromFs(options: FsAwayCollectionOptions): Promise<LogCollectionResult> {
  const now = options.now ?? new Date();
  const windowEndIso = now.toISOString();

  const files = await discoverNginxLogFiles({ rootDir: options.rootDir });
  const selected: string[] = [];
  let bytesRead = 0;
  let filesWithUpdates = 0;

  for (const filePath of files) {
    const tailed = await tailLastLinesFromFile({
      filePath,
      lines: options.perFileLines,
      maxBytes: options.maxBytesPerFile
    });

    bytesRead += tailed.bytesRead;
    if (tailed.lines.length > 0) {
      filesWithUpdates += 1;
    }

    const label = `[${path.relative(options.rootDir, filePath)}]`;
    for (const line of tailed.lines) {
      selected.push(`${label} ${line}`);
    }
  }

  const selectedBeforeLimit = selected.length;
  const lines =
    selected.length <= options.maxLinesTotal
      ? selected
      : selected.slice(selected.length - options.maxLinesTotal);

  return {
    lines,
    meta: {
      totalLines: selectedBeforeLimit,
      parsedTimestampLines: selectedBeforeLimit,
      invalidTimestampLines: 0,
      selectedBeforeLimit,
      droppedByLimit: selectedBeforeLimit - lines.length,
      filesConsidered: files.length,
      filesWithUpdates,
      bytesRead,
      windowStartIso: null,
      windowEndIso
    }
  };
}
