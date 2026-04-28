import { readdir } from "node:fs/promises";
import path from "node:path";

export type DiscoverLogFilesOptions = {
  rootDir: string;
};

function isLogFile(filePath: string): boolean {
  return filePath.toLowerCase().endsWith(".log");
}

export async function discoverNginxLogFiles(options: DiscoverLogFilesOptions): Promise<string[]> {
  const root = path.resolve(options.rootDir);
  const results: string[] = [];

  async function walk(dir: string): Promise<void> {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      // If we can't read a directory, just skip it (permissions, missing, etc.).
      return;
    }

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath);
        continue;
      }

      if (entry.isFile() && isLogFile(fullPath)) {
        results.push(fullPath);
      }
    }
  }

  await walk(root);

  // Stable ordering helps with reproducibility and deterministic limiting.
  results.sort((a, b) => a.localeCompare(b));
  return results;
}