import { describe, it, expect } from "vitest";
import { tryRunWithGlobalMutex } from "./run-mutex.js";

describe("tryRunWithGlobalMutex", () => {
  it("acquires lock and returns result", async () => {
    const result = await tryRunWithGlobalMutex(async () => 42);
    expect(result.acquired).toBe(true);
    expect(result.result).toBe(42);
  });

  it("rejects concurrent call while work is running", async () => {
    let resolveFirst: (() => void) | undefined;
    const firstWork = new Promise<void>((resolve) => {
      resolveFirst = resolve;
    });

    const first = tryRunWithGlobalMutex(async () => {
      await firstWork;
      return "first";
    });

    const second = tryRunWithGlobalMutex(async () => "second");
    const secondResult = await second;
    expect(secondResult.acquired).toBe(false);

    resolveFirst!();
    const firstResult = await first;
    expect(firstResult.acquired).toBe(true);
    expect(firstResult.result).toBe("first");
  });

  it("releases lock after work completes", async () => {
    await tryRunWithGlobalMutex(async () => "done");
    const second = tryRunWithGlobalMutex(async () => "available");
    const result = await second;
    expect(result.acquired).toBe(true);
    expect(result.result).toBe("available");
  });

  it("releases lock even if work throws", async () => {
    await expect(
      tryRunWithGlobalMutex(async () => {
        throw new Error("boom");
      })
    ).rejects.toThrow("boom");

    const after = tryRunWithGlobalMutex(async () => "recovered");
    const result = await after;
    expect(result.acquired).toBe(true);
    expect(result.result).toBe("recovered");
  });
});
