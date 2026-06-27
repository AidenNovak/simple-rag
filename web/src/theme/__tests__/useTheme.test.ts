import { describe, it, expect, beforeEach } from "vitest";
import { getStoredTheme, setStoredTheme, applyTheme, type Theme } from "../useTheme.js";

describe("useTheme", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute("data-theme");
  });

  it("defaults to light when storage empty", () => {
    expect(getStoredTheme()).toBe("light");
  });

  it("persists dark to localStorage", () => {
    setStoredTheme("dark");
    expect(localStorage.getItem("kb.theme")).toBe("dark");
    expect(getStoredTheme()).toBe("dark");
  });

  it("applyTheme sets data-theme and color-scheme", () => {
    applyTheme("light");
    expect(document.documentElement.dataset.theme).toBe("light");
    expect(document.documentElement.style.colorScheme).toBe("light");
    applyTheme("dark");
    expect(document.documentElement.dataset.theme).toBe("dark");
  });
});
