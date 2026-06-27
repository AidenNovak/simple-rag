import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { CraftBody } from "../CraftBody.js";

vi.mock("markstream-react", () => ({
  default: ({ content }: { content: string }) => <div data-testid="md">{content}</div>,
}));

describe("CraftBody", () => {
  it("renders markdown content", () => {
    render(<CraftBody content="# Hello" onOpenPeek={() => {}} onPick={() => {}} />);
    expect(screen.getByTestId("md")).toHaveTextContent("# Hello");
  });

  it("double-click opens peek", () => {
    const onOpenPeek = vi.fn();
    render(<CraftBody content="body" onOpenPeek={onOpenPeek} onPick={() => {}} />);
    fireEvent.doubleClick(screen.getByTestId("craft-body"));
    expect(onOpenPeek).toHaveBeenCalledOnce();
  });

  it("mouseup with long selection calls onPick", () => {
    const onPick = vi.fn();
    render(<CraftBody content="abcdefghijklmnop" onOpenPeek={() => {}} onPick={onPick} />);
    const sel = { toString: () => "abcdefghijklmnop", rangeCount: 1 } as Selection;
    vi.spyOn(window, "getSelection").mockReturnValue(sel);
    fireEvent.mouseUp(screen.getByTestId("craft-body"));
    expect(onPick).toHaveBeenCalledWith("abcdefghijklmnop");
  });
});
