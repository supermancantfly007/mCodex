import { describe, expect, it } from "vitest";
import { applyDesktopRuntime } from "./desktop-runtime.js";

const thread = (id: string, status: string) => ({ id, status, title: id });

describe("applyDesktopRuntime", () => {
  it("normalizes a missing thread list during Bridge recovery", () => {
    expect(applyDesktopRuntime(undefined, { connected: false })).toEqual([]);
    expect(applyDesktopRuntime(null, { connected: true, runningThreadIds: [] })).toEqual([]);
  });

  it("uses the connected Desktop runtime as the active-state authority", () => {
    expect(applyDesktopRuntime([
      thread("active", "completed"),
      thread("stale", "running"),
    ], { connected: true, runningThreadIds: ["active"] })).toEqual([
      thread("active", "running"),
      thread("stale", "interrupted"),
    ]);
  });
});
