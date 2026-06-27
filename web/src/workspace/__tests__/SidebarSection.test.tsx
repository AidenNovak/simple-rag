import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import { SidebarSection } from "../SidebarSection.js";

describe("SidebarSection", () => {
  it("renders title and calls action", async () => {
    const user = userEvent.setup();
    const onAction = vi.fn();
    render(
      <SidebarSection title="笔记" actionLabel="新建笔记" onAction={onAction}>
        <li>child</li>
      </SidebarSection>
    );
    expect(screen.getByText("笔记")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "新建笔记" }));
    expect(onAction).toHaveBeenCalledOnce();
  });
});
