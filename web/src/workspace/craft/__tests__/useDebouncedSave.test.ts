import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { useDebouncedSave } from "../useDebouncedSave.js";

describe("useDebouncedSave", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("calls save after 800ms idle", async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const { rerender } = renderHook(
      ({ v }) => useDebouncedSave(v, save, 800),
      { initialProps: { v: "a" } }
    );
    rerender({ v: "ab" });
    expect(save).not.toHaveBeenCalled();
    await act(async () => { vi.advanceTimersByTime(800); });
    expect(save).toHaveBeenCalledWith("ab");
  });
});
