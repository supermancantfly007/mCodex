import { describe, expect, it } from "vitest";
import { listDirectories, listRoots } from "./folder-picker.js";

describe("folder-picker", () => {
  it("lists available roots including the user home", async () => {
    const roots = await listRoots();
    expect(roots.home.length).toBeGreaterThan(0);
    expect(roots.roots.some((entry) => entry.path === roots.home)).toBe(true);
  });

  it("lists directories under a known path", async () => {
    const roots = await listRoots();
    const listed = await listDirectories(roots.home);
    expect(listed.current).toBeTruthy();
    expect(Array.isArray(listed.directories)).toBe(true);
  });
});