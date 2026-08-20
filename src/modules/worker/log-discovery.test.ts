import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdir, mkdtemp, writeFile, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { discoverNginxLogFiles } from "./log-discovery.js";

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await mkTmpDir();
});

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true });
});

async function mkTmpDir(): Promise<string> {
  return await mkdtemp(path.join(os.tmpdir(), "log-discovery-test-"));
}

async function touchFile(filePath: string, content = ""): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, content, "utf8");
}

describe("discoverNginxLogFiles", () => {
  it("finds .log files in root directory", async () => {
    await touchFile(path.join(tmpDir, "access.log"));
    await touchFile(path.join(tmpDir, "error.log"));

    const files = await discoverNginxLogFiles({ rootDir: tmpDir });
    expect(files).toHaveLength(2);
    expect(files.every((f) => f.endsWith(".log"))).toBe(true);
  });

  it("ignores non-.log files", async () => {
    await touchFile(path.join(tmpDir, "access.log"));
    await touchFile(path.join(tmpDir, "readme.txt"));
    await touchFile(path.join(tmpDir, "config.yml"));

    const files = await discoverNginxLogFiles({ rootDir: tmpDir });
    expect(files).toHaveLength(1);
  });

  it("recurses into subdirectories", async () => {
    await touchFile(path.join(tmpDir, "vhosts", "example.com", "access.log"));
    await touchFile(path.join(tmpDir, "vhosts", "example.com", "error.log"));
    await touchFile(path.join(tmpDir, "archived", "old.log"));

    const files = await discoverNginxLogFiles({ rootDir: tmpDir });
    expect(files).toHaveLength(3);
  });

  it("returns empty array for empty directory", async () => {
    const files = await discoverNginxLogFiles({ rootDir: tmpDir });
    expect(files).toHaveLength(0);
  });

  it("returns empty array for non-existent directory", async () => {
    const files = await discoverNginxLogFiles({ rootDir: "/nonexistent/path" });
    expect(files).toHaveLength(0);
  });

  it("returns sorted results", async () => {
    await touchFile(path.join(tmpDir, "zebra.log"));
    await touchFile(path.join(tmpDir, "alpha.log"));
    await touchFile(path.join(tmpDir, "middle.log"));

    const files = await discoverNginxLogFiles({ rootDir: tmpDir });
    const basenames = files.map((f) => path.basename(f));
    expect(basenames).toEqual(["alpha.log", "middle.log", "zebra.log"]);
  });

  it("handles deeply nested directories", async () => {
    await touchFile(path.join(tmpDir, "a", "b", "c", "d", "deep.log"));

    const files = await discoverNginxLogFiles({ rootDir: tmpDir });
    expect(files).toHaveLength(1);
    expect(files[0]).toContain("deep.log");
  });

  it("is case-insensitive for .log extension", async () => {
    await touchFile(path.join(tmpDir, "ACCESS.LOG"));
    await touchFile(path.join(tmpDir, "error.Log"));

    const files = await discoverNginxLogFiles({ rootDir: tmpDir });
    expect(files).toHaveLength(2);
  });
});
