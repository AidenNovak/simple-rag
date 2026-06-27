import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import { ContextRefBar } from "../ContextRefBar.js";

const NOTES = [{ id: "n1", title: "A" }, { id: "n2", title: "B" }];

describe("ContextRefBar", () => {
  it("shows single title when one selected", () => {
    render(
      <ContextRefBar selectedIds={["n1"]} titles={{ n1: "A" }} notes={NOTES} onToggle={vi.fn()} onClear={vi.fn()} />
    );
    expect(screen.getByTestId("context-ref-bar")).toHaveTextContent("参考：A");
  });

  it("shows count when multiple selected", () => {
    render(
      <ContextRefBar selectedIds={["n1", "n2"]} titles={{ n1: "A", n2: "B" }} notes={NOTES} onToggle={vi.fn()} onClear={vi.fn()} />
    );
    expect(screen.getByTestId("context-ref-bar")).toHaveTextContent("参考：2 篇");
  });

  it("opens menu and toggles a note", async () => {
    const user = userEvent.setup();
    const onToggle = vi.fn();
    render(
      <ContextRefBar selectedIds={["n1"]} titles={{ n1: "A" }} notes={NOTES} onToggle={onToggle} onClear={vi.fn()} />
    );
    await user.click(screen.getByRole("button", { name: /更换参考笔记/ }));
    expect(document.body.querySelector(".ws-ref-portal")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: /B/ }));
    expect(onToggle).toHaveBeenCalledWith("n2", "B");
  });
});
