import { readdir, stat, unlink } from "node:fs/promises";
import path from "node:path";

export type CleanupOldReportsOptions = {
  reportsDir: string;
  reportPrefix: string;
  retentionDays: number;
  now?: Date;
};

export type CleanupOldReportsResult = {
  scannedCount: number;
  deletedCount: number;
  deletedFiles: string[];
};

export async function cleanupOldReports(
  options: CleanupOldReportsOptions
): Promise<CleanupOldReportsResult> {
  const now = options.now ?? new Date();
  const cutoffMs = now.getTime() - options.retentionDays * 24 * 60 * 60 * 1000;

  const entries = await readdir(options.reportsDir, { withFileTypes: true });
  const names = entries
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .filter((name) => name.startsWith(`${options.reportPrefix}-`) && name.endsWith(".md"));

  const deletedFiles: string[] = [];

  for (const name of names) {
    const fullPath = path.join(options.reportsDir, name);
    const fileStat = await stat(fullPath);
    if (fileStat.mtimeMs < cutoffMs) {
      await unlink(fullPath);
      deletedFiles.push(fullPath);
    }
  }

  return {
    scannedCount: names.length,
    deletedCount: deletedFiles.length,
    deletedFiles
  };
}
