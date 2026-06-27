import { describe, it, expect } from "vitest";
import { extractToc } from "../extractToc.js";

describe("extractToc", () => {
  it("extracts h1-h3 with levels", () => {
    const md = "# Title\n\n## Section A\n\ntext\n\n### Sub\n\n## Section B";
    const toc = extractToc(md);
    expect(toc).toEqual([
      { level: 1, text: "Title" },
      { level: 2, text: "Section A" },
      { level: 3, text: "Sub" },
      { level: 2, text: "Section B" },
    ]);
  });

  it("ignores h4-h6", () => {
    const md = "# H1\n\n#### H4\n\n##### H5";
    const toc = extractToc(md);
    expect(toc).toEqual([{ level: 1, text: "H1" }]);
  });

  it("ignores code blocks", () => {
    const md = "# Real\n\n```\n# Not a heading\n```\n\n## Also real";
    const toc = extractToc(md);
    expect(toc).toEqual([
      { level: 1, text: "Real" },
      { level: 2, text: "Also real" },
    ]);
  });

  it("returns empty for no headings", () => {
    expect(extractToc("just text\n\nno headings")).toEqual([]);
  });
});
