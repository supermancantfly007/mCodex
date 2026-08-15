import { describe, expect, it } from "vitest";
import { decodeApplicationServerKey, notificationThreadIdFromSearch } from "./push-notifications.js";

describe("push notification helpers", () => {
  it("decodes URL-safe VAPID public keys", () => {
    expect([...decodeApplicationServerKey("AQIDBA")]).toEqual([1, 2, 3, 4]);
  });

  it("accepts only real thread IDs from notification URLs", () => {
    expect(notificationThreadIdFromSearch("?thread=019fdb3a-224d-7940-8af2-d4e3f0c052b2")).toBe("019fdb3a-224d-7940-8af2-d4e3f0c052b2");
    expect(notificationThreadIdFromSearch("?thread=../../settings")).toBeNull();
  });
});
