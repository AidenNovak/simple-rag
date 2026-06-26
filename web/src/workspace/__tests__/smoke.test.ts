import { describe, it, expect } from "vitest";

describe("vitest smoke", () => {
  it("runs in jsdom", () => {
    expect(typeof window).toBe("object");
  });
});
