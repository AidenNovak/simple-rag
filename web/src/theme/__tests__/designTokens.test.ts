import { describe, it, expect, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");

describe("design tokens v2", () => {
  beforeEach(() => {
    document.documentElement.setAttribute("data-theme", "light");
  });

  it("tokens.css defines spacing scale", () => {
    const css = readFileSync(resolve(root, "tokens.css"), "utf8");
    expect(css).toContain("--space-1: 4px");
    expect(css).toContain("--status-pending:");
  });

  it("typography.css defines text-caption", () => {
    const css = readFileSync(resolve(root, "typography.css"), "utf8");
    expect(css).toContain(".text-caption");
    expect(css).toContain("var(--text-caption-size");
  });

  it("motion.css respects reduced motion", () => {
    const css = readFileSync(resolve(root, "motion.css"), "utf8");
    expect(css).toContain("prefers-reduced-motion");
  });
});
