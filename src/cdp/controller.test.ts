import { describe, expect, it } from "vitest";
import { isCodexPermissionMode, isFollowUpMode, permissionModeFromLabel } from "./controller.js";

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
