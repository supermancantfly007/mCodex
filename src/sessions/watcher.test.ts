import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { BridgeEvent } from "../types.js";
import { SessionWatcher } from "./watcher.js";

describe("SessionWatcher", () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
  });

  it("ignores a session file removed between discovery and reading", async () => {
    const watcher = new SessionWatcher("C:\\missing-codex-home", 500);
    const readGrowth = (watcher as unknown as { readGrowth(filePath: string): Promise<void> }).readGrowth.bind(watcher);

    await expect(readGrowth("C:\\missing-codex-home\\sessions\\deleted.jsonl")).resolves.toBeUndefined();
  });

  it("emits rollback events for connected clients", async () => {
    const codexHome = await mkdtemp(path.join(os.tmpdir(), "mcodex-watcher-"));
    tempDirs.push(codexHome);
    const sessionsDir = path.join(codexHome, "sessions");
    await mkdir(sessionsDir);
    const threadId = "019fdb3a-224d-7940-8af2-d4e3f0c052b2";
    const filePath = path.join(sessionsDir, `rollout-${threadId}.jsonl`);
    await writeFile(filePath, `${JSON.stringify({ timestamp: "2026-01-01T00:00:00Z", type: "event_msg", payload: { type: "thread_rolled_back", num_turns: 2 } })}\n`);
    const watcher = new SessionWatcher(codexHome, 500);
    const events: BridgeEvent[] = [];
    watcher.on("event", (event: BridgeEvent) => events.push(event));

    const readGrowth = (watcher as unknown as { readGrowth(filePath: string): Promise<void> }).readGrowth.bind(watcher);
    await readGrowth(filePath);

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ threadId, item: null, rollbackTurns: 2, eventType: "thread_rolled_back" });
  });

  it("preserves completion event types for notification delivery", async () => {
    const codexHome = await mkdtemp(path.join(os.tmpdir(), "mcodex-watcher-"));
    tempDirs.push(codexHome);
    const sessionsDir = path.join(codexHome, "sessions");
    await mkdir(sessionsDir);
    const threadId = "019fdb3a-224d-7940-8af2-d4e3f0c052b2";
    const filePath = path.join(sessionsDir, `rollout-${threadId}.jsonl`);
    await writeFile(filePath, `${JSON.stringify({ timestamp: "2026-01-01T00:00:00Z", type: "event_msg", payload: { type: "task_complete" } })}\n`);
    const watcher = new SessionWatcher(codexHome, 500);
    const events: BridgeEvent[] = [];
    watcher.on("event", (event: BridgeEvent) => events.push(event));

    const readGrowth = (watcher as unknown as { readGrowth(filePath: string): Promise<void> }).readGrowth.bind(watcher);
    await readGrowth(filePath);

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ threadId, status: "completed", eventType: "task_complete" });
  });
});
