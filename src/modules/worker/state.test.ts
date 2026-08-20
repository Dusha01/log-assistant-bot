import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { readFile, mkdtemp, writeFile, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import {
  createEmptyState,
  readStateFile,
  writeStateFile,
} from "./state.js";

let tmpDir: string;
let stateFile: string;

beforeEach(async () => {
  tmpDir = await mkdtemp(path.join(os.tmpdir(), "state-test-"));
  stateFile = path.join(tmpDir, "state.json");
});

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true });
});

describe("createEmptyState", () => {
  it("creates state with default values", () => {
    const state = createEmptyState();
    expect(state.version).toBe(1);
    expect(state.files).toEqual({});
    expect(state.lastRunAt).toBeNull();
    expect(state.lastReportPath).toBeNull();
  });
});

describe("writeStateFile + readStateFile roundtrip", () => {
  it("writes and reads back a simple state", async () => {
    const state = createEmptyState();
    state.lastRunAt = "2026-05-24T14:00:00.000Z";
    state.lastReportPath = "/app/report.md";
    state.files["/var/log/nginx/access.log"] = {
      inode: 12345,
      offset: 1048576,
      leftover: null,
      lastReadAt: "2026-05-24T14:00:00.000Z",
    };

    await writeStateFile(stateFile, state);
    const loaded = await readStateFile(stateFile);

    expect(loaded.version).toBe(1);
    expect(loaded.lastRunAt).toBe("2026-05-24T14:00:00.000Z");
    expect(loaded.lastReportPath).toBe("/app/report.md");
    expect(loaded.files["/var/log/nginx/access.log"]).toMatchObject({
      inode: 12345,
      offset: 1048576,
      leftover: null,
    });
  });

  it("writes leftover bytes correctly", async () => {
    const state = createEmptyState();
    state.files["/var/log/nginx/access.log"] = {
      inode: 1,
      offset: 100,
      leftover: "partial line ",
      lastReadAt: "2026-05-24T14:00:00.000Z",
    };

    await writeStateFile(stateFile, state);
    const raw = await readFile(stateFile, "utf8");
    const disk = JSON.parse(raw);

    expect(disk.files[0].leftoverBytes).toBe(Buffer.byteLength("partial line ", "utf8"));
  });

  it("reads empty state when file does not exist", async () => {
    const state = await readStateFile(path.join(tmpDir, "nonexistent.json"));
    expect(state).toEqual(createEmptyState());
  });

  it("reads empty state for invalid JSON", async () => {
    await writeFile(stateFile, "not json", "utf8");
    const state = await readStateFile(stateFile);
    expect(state).toEqual(createEmptyState());
  });

  it("reads empty state for non-version-1 JSON", async () => {
    await writeFile(stateFile, JSON.stringify({ version: 2 }), "utf8");
    const state = await readStateFile(stateFile);
    expect(state).toEqual(createEmptyState());
  });

  it("handles legacy object-map files format", async () => {
    const legacy = {
      version: 1,
      lastRunAt: "2026-05-24T14:00:00.000Z",
      lastReportPath: null,
      files: {
        "/var/log/nginx/access.log": {
          inode: 99,
          offset: 500,
          leftover: null,
          lastReadAt: "2026-05-24T14:00:00.000Z",
        },
      },
    };
    await writeFile(stateFile, JSON.stringify(legacy), "utf8");

    const state = await readStateFile(stateFile);
    expect(state.files["/var/log/nginx/access.log"]).toMatchObject({
      inode: 99,
      offset: 500,
    });
  });

  it("sorts files by path on disk", async () => {
    const state = createEmptyState();
    state.files["/b.log"] = { inode: 2, offset: 0, leftover: null, lastReadAt: "" };
    state.files["/a.log"] = { inode: 1, offset: 0, leftover: null, lastReadAt: "" };

    await writeStateFile(stateFile, state);
    const raw = await readFile(stateFile, "utf8");
    const disk = JSON.parse(raw);

    expect(disk.files.map((f: { path: string }) => f.path)).toEqual(["/a.log", "/b.log"]);
  });
});
