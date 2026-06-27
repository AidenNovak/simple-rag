import { describe, it, expect } from "vitest";
import fs from "node:fs";

describe("AI ink text CSS", () => {
  it("styles.css does not force white strong text globally", () => {
    const css = fs.readFileSync("web/src/styles.css", "utf8");
    expect(css).not.toMatch(/\.markstream-react strong\s*\{[^}]*#fff/s);
  });

  it("markstream-light.css sets strong to ink", () => {
    const css = fs.readFileSync("web/src/theme/markstream-light.css", "utf8");
    expect(css).toContain(".markstream-react strong");
    expect(css).toContain("var(--ink)");
  });
});
