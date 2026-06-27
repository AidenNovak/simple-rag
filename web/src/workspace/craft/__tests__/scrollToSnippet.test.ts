import { describe, it, expect, beforeEach } from "vitest";
import { findSnippetIndex, scrollCraftToSnippet } from "../scrollToSnippet.js";

describe("findSnippetIndex", () => {
  it("finds trimmed needle up to 80 chars", () => {
    const content = "alpha\nbeta gamma\nomega";
    expect(findSnippetIndex(content, "  beta gamma  ")).toBe(6);
  });

  it("returns -1 for empty needle", () => {
    expect(findSnippetIndex("hello", "   ")).toBe(-1);
  });
});

describe("scrollCraftToSnippet", () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement("div");
    container.style.height = "200px";
    container.style.overflow = "auto";
    Object.defineProperty(container, "scrollTop", { writable: true, value: 0 });
    document.body.appendChild(container);
  });

  it("scrolls and adds flash class when snippet found", () => {
    const content = Array.from({ length: 40 }, (_, i) => `line ${i}`).join("\n");
    const snippet = "line 25";
    const ok = scrollCraftToSnippet(container, content, snippet, { lineHeight: 28 });
    expect(ok).toBe(true);
    expect(container.scrollTop).toBeGreaterThan(0);
    expect(container.classList.contains("ws-snippet-flash")).toBe(true);
  });

  it("returns false when snippet missing", () => {
    expect(scrollCraftToSnippet(container, "abc", "zzz")).toBe(false);
  });
});
