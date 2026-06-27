import { describe, it, expect } from "vitest";
import { computeStats } from "../computeStats.js";

describe("computeStats", () => {
  it("counts CJK + English words", () => {
    const s = computeStats("你好世界 hello world");
    expect(s.words).toBe(6); // 4 CJK + 2 English
  });

  it("estimates read time (300 wpm)", () => {
    const text = "字".repeat(600);
    const s = computeStats(text);
    expect(s.readTimeMin).toBe(2);
  });

  it("minimum 1 minute", () => {
    const s = computeStats("短文本");
    expect(s.readTimeMin).toBe(1);
  });

  it("counts paragraphs by double newline", () => {
    const s = computeStats("段落一\n\n段落二\n\n段落三");
    expect(s.paragraphs).toBe(3);
  });

  it("counts chars", () => {
    expect(computeStats("abc").chars).toBe(3);
  });
});
