import { describe, expect, it } from "vitest";
import type { Page } from "playwright-core";
import type { SessionStore } from "../sessions/store.js";
import { CodexCdpController, isCodexPermissionMode, isFollowUpMode, permissionModeFromLabel, selectCurrentStreamingText, selectRecentThreadIds, shouldUseAlternateFollowUpShortcut, withTimeout } from "./controller.js";

describe("withTimeout", () => {
  it("returns a value when the operation finishes in time", async () => {
    await expect(withTimeout(Promise.resolve("ready"), 50)).resolves.toBe("ready");
  });

  it("rejects a stuck operation and does not block a later operation", async () => {
    await expect(withTimeout(new Promise<never>(() => undefined), 10, "stuck operation")).rejects.toThrow("stuck operation");
    await expect(withTimeout(Promise.resolve("recovered"), 50)).resolves.toBe("recovered");
  });
});

describe("permissionModeFromLabel", () => {
  it.each([
    ["请求批准", "ask"],
    ["Ask for approval", "ask"],
    ["替我审批", "auto"],
    ["Approve for me", "auto"],
    ["完全访问", "full-access"],
    ["Full access", "full-access"],
  ] as const)("maps %s to %s", (label, expected) => {
    expect(permissionModeFromLabel(label)).toBe(expected);
  });

  it("returns null for unavailable or unknown labels", () => {
    expect(permissionModeFromLabel(null)).toBeNull();
    expect(permissionModeFromLabel("自定义")).toBeNull();
  });
});

describe("isCodexPermissionMode", () => {
  it("accepts only supported modes", () => {
    expect(["ask", "auto", "full-access"].every(isCodexPermissionMode)).toBe(true);
    expect(isCodexPermissionMode("custom")).toBe(false);
    expect(isCodexPermissionMode(null)).toBe(false);
  });
});

describe("isFollowUpMode", () => {
  it("accepts the Desktop follow-up modes only", () => {
    expect(["queue", "steer", "interrupt"].every(isFollowUpMode)).toBe(true);
    expect(isFollowUpMode("unknown")).toBe(false);
    expect(isFollowUpMode(null)).toBe(false);
  });
});

describe("shouldUseAlternateFollowUpShortcut", () => {
  it("uses Desktop's default steer behavior when no preference is stored", () => {
    expect(shouldUseAlternateFollowUpShortcut(null, "steer")).toBe(false);
    expect(shouldUseAlternateFollowUpShortcut(null, "queue")).toBe(true);
  });

  it("inverts a stored queue preference only for steer requests", () => {
    expect(shouldUseAlternateFollowUpShortcut("queue", "queue")).toBe(false);
    expect(shouldUseAlternateFollowUpShortcut("queue", "steer")).toBe(true);
  });

  it("treats Desktop's transient interrupt value as steer", () => {
    expect(shouldUseAlternateFollowUpShortcut("interrupt", "steer")).toBe(false);
    expect(shouldUseAlternateFollowUpShortcut("interrupt", "queue")).toBe(true);
  });
});

describe("selectCurrentStreamingText", () => {
  it("does not reuse the previous assistant response after a new user message", () => {
    expect(selectCurrentStreamingText([
      { identity: "assistant", content: "previous answer" },
      { identity: "message-user", content: "hello" },
    ])).toBe("");
  });

  it("returns assistant text written after the latest user message", () => {
    expect(selectCurrentStreamingText([
      { identity: "assistant", content: "previous answer" },
      { identity: "message-user", content: "hello" },
      { identity: "assistant", content: "new answer" },
    ])).toBe("new answer");
  });

  it("stops at the latest user message when newer units have no output", () => {
    expect(selectCurrentStreamingText([
      { identity: "assistant", content: "previous answer" },
      { identity: "message-user", content: "hello" },
      { identity: "assistant-reasoning", content: "" },
    ])).toBe("");
  });

  it("uses the complete Markdown message instead of an inline-code fragment", () => {
    const completeMessage = "重复记录中的证券代码 `603213` 只是整条进度消息的一部分。";
    const candidate = {
      identity: "assistant",
      content: "603213",
      rootContent: completeMessage,
    };

    expect(selectCurrentStreamingText([candidate])).toBe(completeMessage);
  });
});

describe("selectRecentThreadIds", () => {
  it("keeps only visible real threads without a Desktop folder assignment", () => {
    expect(selectRecentThreadIds([
      "local:assigned-thread",
      "local:pure-chat",
      "client-new-thread:temporary",
      "local:pure-chat",
    ], ["local:assigned-thread", "local:historical-thread"])).toEqual(["pure-chat"]);
  });
});

describe("CodexCdpController.createTask", () => {
  it.each(["开始新聊天", "新建任务"])("starts a project chat when Desktop labels the action %s", async (actionLabel) => {
    const project = { id: "project-1", name: "ashare-agent", rootPaths: ["/fixture"], threadIds: [] };
    const expectedButtonName = `在 ${project.name} 中${actionLabel}`;
    const threadId = "thread-new";
    let composerContent = "";
    let submitted = false;

    const projectButton = {
      count: async () => 1,
      click: async () => undefined,
    };
    const missingButton = {
      count: async () => 0,
      click: async () => { throw new Error("locator did not resolve"); },
    };
    const editor = {
      waitFor: async () => undefined,
      fill: async (content: string) => { composerContent = content; },
      innerText: async () => composerContent,
    };
    const sendButton = {
      count: async () => 1,
      last: () => sendButton,
      first: () => sendButton,
      or: () => sendButton,
      // React enables the composer action on the render after fill(). A real
      // Playwright click waits for that transition instead of sampling it.
      isDisabled: async () => true,
      click: async () => {
        await new Promise((resolve) => setTimeout(resolve, 1));
        submitted = true;
      },
    };
    const page = {
      getByRole: (_role: string, options: { name?: string | RegExp }) => {
        const requestedName = options.name;
        const matches = typeof requestedName === "string"
          ? requestedName === expectedButtonName
          : requestedName?.test(expectedButtonName) === true;
        return matches ? projectButton : missingButton;
      },
      locator: (selector: string) => {
        if (selector.includes("contenteditable")) return { first: () => editor };
        if (selector.includes('aria-label*="send"')) return sendButton;
        return missingButton;
      },
    } as unknown as Page;
    const sessions = {
      getThreadFile: async (id: string) => id === threadId ? "/fixture/rollout.jsonl" : null,
      containsUserMessage: async () => true,
    } as unknown as SessionStore;
    const controller = new CodexCdpController("http://unused", sessions);
    const internals = controller as unknown as {
      mainPage: () => Promise<Page>;
      projectsFromPage: () => Promise<typeof project[]>;
      currentThreadId: () => Promise<string | null>;
    };
    internals.mainPage = async () => page;
    internals.projectsFromPage = async () => [project];
    internals.currentThreadId = async () => submitted ? threadId : null;

    await expect(controller.createTask(project.id, "你好", "11111111-1111-4111-8111-111111111111")).resolves.toMatchObject({
      threadId,
      confirmed: true,
      duplicate: false,
    });
  });
});
