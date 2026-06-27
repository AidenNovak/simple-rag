import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

describe("tokens.css contract", () => {
  it("defines required light tokens", () => {
    const css = fs.readFileSync(
      path.resolve("web/src/theme/tokens.css"),
      "utf8"
    );
    expect(css).toContain("--paper-base: #F7F2EA");
    expect(css).toContain("--ink: #1A1612");
    expect(css).toContain("--accent-amber: #B45309");
  });

  it("styles.css no longer hardcodes ChatGPT grays in :root", () => {
    const css = fs.readFileSync(path.resolve("web/src/styles.css"), "utf8");
    expect(css).not.toMatch(/:root\s*\{[^}]*--bg-main:\s*#212121/s);
  });
});
