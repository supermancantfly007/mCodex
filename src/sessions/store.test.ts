import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SessionStore } from "./store.js";

const temporaryRoots: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("SessionStore thread titles", () => {
  it("reuses titles populated by the thread list", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "mcodex-store-"));
    temporaryRoots.push(root);
    const threadId = "11111111-1111-4111-8111-111111111111";
    const sessionDir = path.join(root, "sessions", "2026", "08", "10");
    await mkdir(sessionDir, { recursive: true });
    await writeFile(path.join(sessionDir, `rollout-${threadId}.jsonl`), [
      JSON.stringify({ timestamp: "2026-08-10T00:00:00.000Z", type: "session_meta", payload: { id: threadId, cwd: root } }),
      JSON.stringify({ timestamp: "2026-08-10T00:00:01.000Z", type: "response_item", payload: { type: "message", role: "user", content: [{ type: "input_text", text: "Fallback title" }] } }),
      "",
    ].join("\n"));
    await writeFile(path.join(root, "session_index.jsonl"), `${JSON.stringify({ id: threadId, thread_name: "Cached title" })}\n`);

    const store = new SessionStore(root);
    expect((await store.listThreads())[0]?.title).toBe("Cached title");
    const listThreads = vi.spyOn(store, "listThreads");

    await expect(store.getThreadTitle(threadId)).resolves.toBe("Cached title");
    expect(listThreads).not.toHaveBeenCalled();
  });
});
