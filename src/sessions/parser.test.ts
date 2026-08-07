import { describe, expect, it } from "vitest";
import { extractImages, extractText, inferStatus, isVisibleTimelineItem, statusFromEvent, timelineFromRecord } from "./parser.js";
import { normalizeText } from "./store.js";

describe("session parser", () => {
  it("extracts structured message content", () => {
    expect(extractText([{ type: "input_text", text: "hello" }, { type: "input_text", text: "world" }])).toBe("hello\nworld");
  });

  it("extracts multimodal images and keeps image-only messages visible", () => {
    expect(extractImages([
      { type: "input_text", text: "look" },
      { type: "input_image", image_url: "data:image/png;base64,abc", name: "paste.png" },
      { type: "local_image", path: "C:\\Temp\\shot.webp" },
    ])).toEqual([
      { source: "data:image/png;base64,abc", alt: "paste.png" },
      { source: "C:\\Temp\\shot.webp", alt: "图片 3" },
    ]);
    expect(timelineFromRecord({ type: "response_item", payload: { type: "message", role: "user", content: [{ type: "input_image", image_url: { url: "https://example.com/a.png" } }] } }, "thread", 2))
      .toMatchObject({ kind: "message", role: "user", text: "", images: [{ source: "https://example.com/a.png" }] });
  });

  it("maps tool calls and lifecycle state", () => {
    const item = timelineFromRecord({ timestamp: "2026-01-01T00:00:00Z", type: "response_item", payload: { type: "custom_tool_call", name: "shell", input: { command: "pwd" } } }, "thread", 10);
    expect(item?.kind).toBe("tool_call");
    expect(item).toMatchObject({ text: "shell", activity: { type: "command" } });
    expect(item && isVisibleTimelineItem(item)).toBe(true);
    expect(inferStatus([{ type: "event_msg", payload: { type: "task_started" } }])).toBe("running");
    expect(inferStatus([{ type: "event_msg", payload: { type: "task_complete" } }])).toBe("completed");
  });

  it("keeps recent tool activity as running when lifecycle events are sparse", () => {
    expect(inferStatus([
      { type: "event_msg", payload: { type: "task_started" } },
      { type: "response_item", payload: { type: "function_call", name: "shell_command" } },
      { type: "event_msg", payload: { type: "token_count" } },
    ])).toBe("running");
    expect(inferStatus([
      { type: "event_msg", payload: { type: "task_started" } },
      { type: "event_msg", payload: { type: "task_complete" } },
      { type: "event_msg", payload: { type: "token_count" } },
    ])).toBe("completed");
  });

  it("shows compact reasoning progress without markdown wrappers", () => {
    const item = timelineFromRecord({ type: "event_msg", payload: { type: "agent_reasoning", text: "**Planning concurrent work**" } }, "thread", 14);
    expect(item).toMatchObject({ kind: "reasoning", text: "Planning concurrent work" });
    expect(item && isVisibleTimelineItem(item)).toBe(true);
  });

  it("reads successful file changes from the structured completion event", () => {
    const item = timelineFromRecord({
      type: "event_msg",
      payload: {
        type: "patch_apply_end",
        success: true,
        changes: {
          "C:\\work\\app.ts": { type: "update", unified_diff: "@@ -1,2 +1,3 @@\n-old\n+new\n+extra\n same" },
          "C:\\work\\new.ts": { type: "add", content: "first\nsecond\n" },
        },
      },
    }, "thread", 16);
    expect(item).toMatchObject({
      text: "patch_apply_end",
      eventType: "patch_apply_end",
      activity: {
        type: "file_change",
        fileCount: 2,
        additions: 4,
        deletions: 1,
        files: [
          { path: "C:\\work\\app.ts", additions: 2, deletions: 1 },
          { path: "C:\\work\\new.ts", additions: 2, deletions: 0 },
        ],
      },
    });
    expect(item && isVisibleTimelineItem(item)).toBe(true);
  });

  it("does not show failed patch completion events", () => {
    const item = timelineFromRecord({ type: "event_msg", payload: { type: "patch_apply_end", success: false, changes: {} } }, "thread", 18);
    expect(item).toBeNull();
  });

  it("normalizes ProseMirror paragraph spacing", () => {
    expect(normalizeText("first\n\nsecond\r\n")).toBe("first\nsecond");
  });

  it("recognizes approval wait events", () => {
    expect(statusFromEvent("permission_request")).toBe("waiting_approval");
  });

  it("hides injected desktop context messages", () => {
    const item = timelineFromRecord({ type: "response_item", payload: { type: "message", role: "user", content: [{ text: "<environment_context>internal</environment_context>" }] } }, "thread", 12);
    expect(item).toBeNull();
  });
});
