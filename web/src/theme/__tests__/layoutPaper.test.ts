import { describe, it, expect } from "vitest";
import fs from "node:fs";

describe("layout paper zones", () => {
  it("assigns distinct pane backgrounds", () => {
    const css = fs.readFileSync("web/src/workspace/layout.css", "utf8");
    expect(css).toContain(".workspace-left");
    expect(css).toContain("var(--ws-left-bg)");
    expect(css).toContain(".workspace-center");
    expect(css).toContain("var(--ws-center-bg)");
    expect(css).toContain(".workspace-right");
    expect(css).toContain("var(--ws-right-bg)");
  });
});
