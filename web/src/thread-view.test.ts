import { describe, expect, it } from "vitest";
import { normalizeStoredThreadId, resolveStoredThreadId, shouldShowJumpToLatest } from "./thread-view.js";

describe("stored thread selection", () => {
  it("restores an existing thread and rejects a missing one", () => {
    const threads = [{ id: "thread-a" }, { id: "thread-b" }];
    expect(resolveStoredThreadId("thread-b", threads)).toBe("thread-b");
    expect(resolveStoredThreadId("removed-thread", threads)).toBeNull();
  });

  it("normalizes empty or unreasonable stored values", () => {
    expect(normalizeStoredThreadId("  thread-a  ")).toBe("thread-a");
    expect(normalizeStoredThreadId("   ")).toBeNull();
    expect(normalizeStoredThreadId("x".repeat(201))).toBeNull();
  });
});

describe("shouldShowJumpToLatest", () => {
  it("shows only when the timeline is meaningfully above the bottom", () => {
    expect(shouldShowJumpToLatest({ scrollHeight: 2_000, scrollTop: 700, clientHeight: 800 })).toBe(true);
    expect(shouldShowJumpToLatest({ scrollHeight: 2_000, scrollTop: 1_100, clientHeight: 800 })).toBe(false);
  });
});
