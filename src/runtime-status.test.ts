import { describe, expect, it } from "vitest";
import { reconcileRuntimeStatuses } from "./runtime-status.js";
import type { ThreadSummary } from "./types.js";

function thread(id: string, status: ThreadSummary["status"]): ThreadSummary {
  return { id, status, title: id, cwd: null, filePath: `${id}.jsonl`, archived: false, createdAt: null, updatedAt: "2026-01-01T00:00:00Z", preview: "" };
}

describe("reconcileRuntimeStatuses", () => {
  it("marks abandoned session running state as interrupted", () => {
    const [result] = reconcileRuntimeStatuses([thread("stale", "running")], { connected: true, runningThreadIds: [] });
    expect(result.status).toBe("interrupted");
  });

  it("uses the desktop runtime as the authoritative running state", () => {
    const [result] = reconcileRuntimeStatuses([thread("active", "completed")], { connected: true, runningThreadIds: ["active"] });
    expect(result.status).toBe("running");
  });

  it("preserves session state while desktop control is disconnected", () => {
    const [result] = reconcileRuntimeStatuses([thread("unknown", "running")], { connected: false, runningThreadIds: [] });
    expect(result.status).toBe("running");
  });

  it("does not mark completed tasks interrupted just because they are not in the runtime set", () => {
    const [result] = reconcileRuntimeStatuses([thread("done", "completed")], { connected: true, runningThreadIds: ["other"] });
    expect(result.status).toBe("completed");
  });
});
