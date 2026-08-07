import { describe, expect, it } from "vitest";
import { SessionWatcher } from "./watcher.js";

describe("SessionWatcher", () => {
  it("ignores a session file removed between discovery and reading", async () => {
    const watcher = new SessionWatcher("C:\\missing-codex-home", 500);
    const readGrowth = (watcher as unknown as { readGrowth(filePath: string): Promise<void> }).readGrowth.bind(watcher);

    await expect(readGrowth("C:\\missing-codex-home\\sessions\\deleted.jsonl")).resolves.toBeUndefined();
  });
});
