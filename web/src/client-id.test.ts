import { describe, expect, it } from "vitest";
import { createClientMessageId } from "./client-id.js";

describe("createClientMessageId", () => {
  it("creates a UUID without requiring crypto.randomUUID", () => {
    expect(createClientMessageId()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });
});
