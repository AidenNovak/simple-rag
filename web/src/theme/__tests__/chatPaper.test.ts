import { describe, it, expect } from "vitest";
import fs from "node:fs";

describe("chat paper styles", () => {
  it("composer uses paper input background", () => {
    const css = fs.readFileSync("web/src/styles.css", "utf8");
    expect(css).toMatch(/\.composer\s*\{[^}]*background:\s*var\(--bg-input\)/s);
  });

  it("send button uses amber accent", () => {
    const css = fs.readFileSync("web/src/styles.css", "utf8");
    expect(css).toContain(".send-btn");
    expect(css).toMatch(/background:\s*var\(--accent\)/);
  });
});
