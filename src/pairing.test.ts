import { describe, expect, it } from "vitest";
import { createPairingCodes } from "./pairing.js";

describe("pairing codes", () => {
  it("automatically rotates an expired code and restarts its validity window", () => {
    let now = 1_000;
    const generated = ["AAAABBBB", "CCCCDDDD"];
    const pairing = createPairingCodes({ now: () => now, generate: () => generated.shift()!, ttlMs: 600_000 });

    expect(pairing.current()).toEqual({ code: "AAAABBBB", expiresAt: 601_000 });
    now = 600_999;
    expect(pairing.current()).toEqual({ code: "AAAABBBB", expiresAt: 601_000 });
    now = 601_000;
    expect(pairing.current()).toEqual({ code: "CCCCDDDD", expiresAt: 1_201_000 });
  });

  it("supports an immediate refresh and resets failed-attempt locking", () => {
    const generated = ["AAAABBBB", "CCCCDDDD"];
    const pairing = createPairingCodes({ generate: () => generated.shift()!, maxAttempts: 2 });

    expect(pairing.verify("bad-code")).toBe("invalid");
    expect(pairing.verify("bad-code")).toBe("invalid");
    expect(pairing.verify("AAAABBBB")).toBe("locked");
    expect(pairing.refresh().code).toBe("CCCCDDDD");
    expect(pairing.verify("ccccdddd")).toBe("accepted");
  });
});
