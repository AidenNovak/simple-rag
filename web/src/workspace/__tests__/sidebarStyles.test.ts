import { describe, it, expect } from "vitest";
import fs from "node:fs";

describe("apple sidebar css", () => {
  it("defines brand and active-doc/active-convo", () => {
    const css = fs.readFileSync("web/src/workspace/layout.css", "utf8");
    expect(css).toContain(".ws-sidebar-brand");
    expect(css).toContain(".active-doc");
    expect(css).toContain(".active-convo");
    expect(css).not.toContain(".ws-tree-actions");
  });
});
