import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import { ReferenceNotePicker } from "../ReferenceNotePicker.js";

const NOTES = [
  { id: "n1", title: "未命名笔记" },
  { id: "n2", title: "RAG 架构核心要点" },
];

describe("ReferenceNotePicker", () => {
  it("renders note list and calls onSelect", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<ReferenceNotePicker notes={NOTES} selectedId="n1" onSelect={onSelect} />);
    expect(screen.getByTestId("ref-note-picker")).toBeInTheDocument();
    expect(screen.getByText("选择参考笔记")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /RAG 架构核心要点/ }));
    expect(onSelect).toHaveBeenCalledWith("n2", "RAG 架构核心要点");
  });

  it("shows empty hint when no notes", () => {
    render(<ReferenceNotePicker notes={[]} selectedId={null} onSelect={() => {}} />);
    expect(screen.getByText(/新建笔记/)).toBeInTheDocument();
  });
});
