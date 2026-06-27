import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import { ScopeDropdown } from "../ScopeDropdown.js";

vi.mock("../Icons.js", () => ({ IconLibrary: () => <span data-testid="ico" /> }));

const docs = [{ id: "d1", title: "Doc A" }, { id: "d2", title: "Doc B" }];

describe("ScopeDropdown (Radix)", () => {
  it("menu absent before trigger click", () => {
    render(<ScopeDropdown docs={docs} scopeDocIds={null} onToggleDoc={() => {}} onSelectAll={() => {}} />);
    expect(screen.queryByTestId("scope-dropdown-content")).toBeNull();
  });

  it("UV2: opens via trigger and lists docs", async () => {
    const user = userEvent.setup();
    render(<ScopeDropdown docs={docs} scopeDocIds={null} onToggleDoc={() => {}} onSelectAll={() => {}} />);
    await user.click(screen.getByText(/全部文档/));
    const content = await screen.findByTestId("scope-dropdown-content");
    expect(content).toBeTruthy();
    expect(content.textContent).toContain("Doc A");
    expect(content.textContent).toContain("Doc B");
  });

  it("toggles a doc on item select", async () => {
    const user = userEvent.setup();
    const onToggleDoc = vi.fn();
    render(<ScopeDropdown docs={docs} scopeDocIds={[]} onToggleDoc={onToggleDoc} onSelectAll={() => {}} />);
    await user.click(screen.getByText(/0 篇/));
    const content = await screen.findByTestId("scope-dropdown-content");
    await user.click(screen.getByText("Doc A"));
    expect(onToggleDoc).toHaveBeenCalledWith("d1");
  });
});
