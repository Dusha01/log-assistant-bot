import { readFile, writeFile } from "node:fs/promises";

export type FileCheckpoint = {
  inode: number | null;
  offset: number;
  leftover: string | null;
  lastReadAt: string; // ISO
};

export type BotState = {
  version: 1;
  files: Record<string, FileCheckpoint>;
  lastRunAt: string | null; // ISO
  lastReportPath: string | null;
};

type DiskFileCheckpoint = {
  path: string;
  inode: number | null;
  offset: number;
  leftoverBytes: number;
  lastReadAt: string;
};

type DiskStateV1 = {
  version: 1;
  lastRunAt: string | null;
  lastReportPath: string | null;
  files: DiskFileCheckpoint[];
};

export function createEmptyState(): BotState {
  return {
    version: 1,
    files: {},
    lastRunAt: null,
    lastReportPath: null
  };
}

export async function readStateFile(stateFilePath: string): Promise<BotState> {
  try {
    const raw = await readFile(stateFilePath, "utf8");
    const parsed = JSON.parse(raw) as unknown;

    // New, human-readable on-disk shape: files as array.
    if (typeof parsed === "object" && parsed !== null && (parsed as { version?: unknown }).version === 1) {
      const p = parsed as Partial<DiskStateV1> & { files?: unknown };
      const lastRunAt = typeof p.lastRunAt === "string" ? p.lastRunAt : null;
      const lastReportPath = typeof p.lastReportPath === "string" ? p.lastReportPath : null;

      if (Array.isArray(p.files)) {
        const files: Record<string, FileCheckpoint> = {};
        for (const item of p.files) {
          if (!item || typeof item !== "object") continue;
          const it = item as Partial<DiskFileCheckpoint>;
          if (typeof it.path !== "string") continue;
          files[it.path] = {
            inode: typeof it.inode === "number" && Number.isFinite(it.inode) ? it.inode : null,
            offset: typeof it.offset === "number" && Number.isFinite(it.offset) ? it.offset : 0,
            leftover: null,
            lastReadAt: typeof it.lastReadAt === "string" ? it.lastReadAt : lastRunAt ?? new Date().toISOString()
          };
        }
        return { version: 1, files, lastRunAt, lastReportPath };
      }

      // Backwards-compatible legacy shape: files as object map.
      if (typeof p.files === "object" && p.files !== null) {
        return {
          version: 1,
          files: p.files as Record<string, FileCheckpoint>,
          lastRunAt,
          lastReportPath
        };
      }
    }
  } catch {
    // missing/unreadable/invalid => start fresh
  }
  return createEmptyState();
}

export async function writeStateFile(stateFilePath: string, state: BotState): Promise<void> {
  const files = Object.entries(state.files)
    .map(([filePath, cp]) => ({
      path: filePath,
      inode: cp.inode,
      offset: cp.offset,
      leftoverBytes: cp.leftover ? Buffer.byteLength(cp.leftover, "utf8") : 0,
      lastReadAt: cp.lastReadAt
    }))
    .sort((a, b) => a.path.localeCompare(b.path));

  const disk: DiskStateV1 = {
    version: 1,
    lastRunAt: state.lastRunAt,
    lastReportPath: state.lastReportPath,
    files
  };

  const body = JSON.stringify(disk, null, 2);
  await writeFile(stateFilePath, body + "\n", "utf8");
}

