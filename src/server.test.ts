import { describe, expect, it } from "vitest";
import { deferInlineTimelineImages, isLoopbackAddress, mayUseQueryToken } from "./server.js";

describe("server security helpers", () => {
  it("recognizes IPv4, IPv6, and mapped loopback addresses", () => {
    expect(isLoopbackAddress("127.0.0.1")).toBe(true);
    expect(isLoopbackAddress("127.1.2.3")).toBe(true);
    expect(isLoopbackAddress("::1")).toBe(true);
    expect(isLoopbackAddress("::ffff:127.0.0.1")).toBe(true);
    expect(isLoopbackAddress("192.168.1.20")).toBe(false);
    expect(isLoopbackAddress(undefined)).toBe(false);
  });

  it("only permits query tokens for GET media requests", () => {
    expect(mayUseQueryToken("GET", "/media")).toBe(true);
    expect(mayUseQueryToken("POST", "/media")).toBe(false);
    expect(mayUseQueryToken("GET", "/threads")).toBe(false);
  });

  it("defers inline timeline images to the authenticated media route", () => {
    const [item] = deferInlineTimelineImages([{
      id: "thread:42",
      threadId: "thread-id",
      timestamp: null,
      kind: "message",
      role: "user",
      text: "screenshot",
      images: [{ source: "data:image/png;base64,YWJj", alt: "shot" }],
    }]);
    expect(item?.images?.[0]).toEqual({
      source: "/api/media?threadId=thread-id&itemId=thread%3A42&imageIndex=0",
      alt: "shot",
    });
  });
});
