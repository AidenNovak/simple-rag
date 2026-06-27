import { describe, it, expect } from "vitest";
import fs from "node:fs";

describe("markstream themes", () => {
  it("light theme uses ink color for headings", () => {
    const css = fs.readFileSync("web/src/theme/markstream-light.css", "utf8");
    expect(css).toContain("color: var(--ink)");
    expect(css).not.toContain("#ececec");
  });

  it("dark theme scoped under data-theme=dark", () => {
    const css = fs.readFileSync("web/src/theme/markstream-dark.css", "utf8");
    expect(css).toContain('[data-theme="dark"]');
  });
});
