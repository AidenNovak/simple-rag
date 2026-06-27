import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import { ContextRefBar } from "../ContextRefBar.js";

const NOTES = [{ id: "n1", title: "A" }, { id: "n2", title: "B" }];

describe("ContextRefBar", () => {
  it("shows reference title and opens menu", async () => {
    const user = userEvent.setup();
    render(
      <ContextRefBar
        title="A"
        selectedId="n1"
        notes={NOTES}
        onSelect={vi.fn()}
        onClear={vi.fn()}
      />
    );
    expect(screen.getByTestId("context-ref-bar")).toHaveTextContent("参考：A");
    await user.click(screen.getByRole("button", { name: /更换参考笔记/ }));
    expect(document.body.querySelector(".ws-ref-portal")).toBeTruthy();
  });
});
