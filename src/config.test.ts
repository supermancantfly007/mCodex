import { describe, expect, it } from "vitest";
import { resolveExternalAccess, resolvePushSubject } from "./config.js";

describe("resolveExternalAccess", () => {
  it("requires remote authentication on non-loopback listeners", () => {
    expect(resolveExternalAccess("0.0.0.0", undefined)).toBe(true);
    expect(resolveExternalAccess("0.0.0.0", "false")).toBe(true);
  });

  it("can require remote authentication while listening only on loopback", () => {
    expect(resolveExternalAccess("127.0.0.1", "true")).toBe(true);
    expect(resolveExternalAccess("localhost", "1")).toBe(true);
  });

  it("keeps ordinary local-only mode unauthenticated", () => {
    expect(resolveExternalAccess("127.0.0.1", undefined)).toBe(false);
    expect(resolveExternalAccess("::1", "false")).toBe(false);
  });

  it("rejects ambiguous values", () => {
    expect(() => resolveExternalAccess("127.0.0.1", "sometimes")).toThrow(
      "BRIDGE_EXTERNAL_ACCESS must be true or false when it is set",
    );
  });
});

describe("resolvePushSubject", () => {
  it("accepts HTTPS and mailto VAPID contacts", () => {
    expect(resolvePushSubject("https://example.com/contact")).toBe("https://example.com/contact");
    expect(resolvePushSubject("mailto:admin@example.com")).toBe("mailto:admin@example.com");
  });

  it("rejects VAPID contacts that push services cannot use", () => {
    expect(() => resolvePushSubject("http://example.com")).toThrow("BRIDGE_PUSH_SUBJECT");
  });
});
