import { describe, expect, it } from "vitest";
import { buildDesktopTimeline, rollbackTimelineItems, shouldShowThinking } from "./timeline";

interface TestItem {
  id: string;
  kind: string;
  role: string;
  timestamp: string | null;
  phase?: string;
  activity?: {
    type: "command" | "file_change";
    fileCount?: number;
    additions?: number;
    deletions?: number;
    files?: Array<{ path: string; additions: number; deletions: number }>;
  };
}

describe("rollbackTimelineItems", () => {
  it("removes the latest user turn and all of its output", () => {
    const items = [
      { id: "user-1", kind: "message", role: "user" },
      { id: "assistant-1", kind: "message", role: "assistant" },
      { id: "user-2", kind: "message", role: "user" },
      { id: "reasoning-2", kind: "reasoning", role: "assistant" },
      { id: "tool-2", kind: "tool_call", role: "assistant" },
    ];

    expect(rollbackTimelineItems(items, 1).map((item) => item.id)).toEqual(["user-1", "assistant-1"]);
  });
});

describe("shouldShowThinking", () => {
  const previousTurn = [
    { kind: "message", role: "user" },
    { kind: "message", role: "assistant" },
    { kind: "message", role: "user" },
  ];

  it("shows while the current user turn is running without output", () => {
    expect(shouldShowThinking(previousTurn, true, false)).toBe(true);
  });

  it("hides when the task stops or live output begins", () => {
    expect(shouldShowThinking(previousTurn, false, false)).toBe(false);
    expect(shouldShowThinking(previousTurn, true, true)).toBe(false);
  });

  it.each(["reasoning", "tool_call"])("hides after %s activity begins", (kind) => {
    expect(shouldShowThinking([...previousTurn, { kind, role: "assistant" }], true, false)).toBe(false);
  });

  it("hides after the assistant message is recorded", () => {
    expect(shouldShowThinking([...previousTurn, { kind: "message", role: "assistant" }], true, false)).toBe(false);
  });
});

describe("buildDesktopTimeline", () => {
  it("folds completed work and places file changes after the final answer", () => {
    const items: TestItem[] = [
      { id: "user", kind: "message", role: "user", timestamp: "2026-08-10T06:33:08.000Z" },
      { id: "reasoning", kind: "reasoning", role: "assistant", timestamp: "2026-08-10T06:33:16.000Z" },
      { id: "commentary", kind: "message", role: "assistant", phase: "commentary", timestamp: "2026-08-10T06:33:16.000Z" },
      { id: "patch-command", kind: "tool_call", role: "assistant", timestamp: "2026-08-10T06:33:21.000Z", activity: { type: "command" } },
      { id: "patch", kind: "tool_call", role: "assistant", timestamp: "2026-08-10T06:33:21.000Z", activity: { type: "file_change", fileCount: 1, additions: 11, deletions: 0, files: [{ path: "C:\\work\\短篇故事.md", additions: 11, deletions: 0 }] } },
      { id: "verify-command", kind: "tool_call", role: "assistant", timestamp: "2026-08-10T06:33:26.000Z", activity: { type: "command" } },
      { id: "final", kind: "message", role: "assistant", phase: "final_answer", timestamp: "2026-08-10T06:33:33.000Z" },
    ];

    const display = buildDesktopTimeline(items, "C:\\work");

    expect(display.map((item) => item.type)).toEqual(["message", "processing", "message", "file_change"]);
    expect(display[1]).toMatchObject({ type: "processing", commandCount: 1, commentary: [{ id: "commentary" }] });
    expect(display[2]).toMatchObject({ type: "message", item: { id: "final" } });
    expect(display[3]).toMatchObject({ type: "file_change", fileCount: 1, additions: 11, deletions: 0, files: [{ path: "短篇故事.md" }] });
  });

  it("keeps commentary and command activity visible before a final answer exists", () => {
    const items: TestItem[] = [
      { id: "user", kind: "message", role: "user", timestamp: "2026-08-10T06:33:08.000Z" },
      { id: "commentary", kind: "message", role: "assistant", phase: "commentary", timestamp: "2026-08-10T06:33:16.000Z" },
      { id: "command", kind: "tool_call", role: "assistant", timestamp: "2026-08-10T06:33:21.000Z", activity: { type: "command" } },
    ];

    expect(buildDesktopTimeline(items, null).map((item) => item.type)).toEqual(["message", "message", "commands"]);
  });
});
