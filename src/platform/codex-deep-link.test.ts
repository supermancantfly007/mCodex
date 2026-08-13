import { describe, expect, it } from "vitest";
import { resolveCodexDeepLinkCommand } from "./codex-deep-link.js";

describe("resolveCodexDeepLinkCommand", () => {
  it("uses Explorer on Windows", () => {
    expect(resolveCodexDeepLinkCommand("codex://threads/thread-id", "win32")).toEqual({
      executable: "explorer.exe",
      args: ["codex://threads/thread-id"],
    });
  });

  it("uses the system URL opener on macOS", () => {
    expect(resolveCodexDeepLinkCommand("codex://threads/thread-id", "darwin")).toEqual({
      executable: "open",
      args: ["codex://threads/thread-id"],
    });
  });

  it("rejects hosts without a Codex Desktop adapter", () => {
    expect(() => resolveCodexDeepLinkCommand("codex://threads/thread-id", "linux")).toThrow(
      "Opening Codex thread deep links is not supported on linux",
    );
  });
});
