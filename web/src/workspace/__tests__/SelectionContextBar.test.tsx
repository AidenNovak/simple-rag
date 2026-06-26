import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect } from "vitest";
import { WorkspaceProvider, useWorkspace } from "../WorkspaceStore.js";
import { SelectionContextBar } from "../SelectionContextBar.js";
import { useEffect } from "react";

function WithSelection() {
  const { dispatch } = useWorkspace();
  useEffect(() => {
    dispatch({ type: "SET_SELECTION", payload: { docId: "d1", text: "a picked sentence here, exactly", start: 0, end: 31 } });
  }, [dispatch]);
  return <SelectionContextBar />;
}

describe("SelectionContextBar", () => {
  it("shows chip with char count when selection exists", () => {
    render(<WorkspaceProvider><WithSelection /></WorkspaceProvider>);
    expect(screen.getByTestId("selection-bar")).toHaveTextContent(/已选/);
    expect(screen.getByTestId("selection-bar")).toHaveTextContent(/31/);
    expect(screen.getByRole("button", { name: "加入对话" })).toBeInTheDocument();
  });

  it("renders nothing when no selection", () => {
    render(<WorkspaceProvider><SelectionContextBar /></WorkspaceProvider>);
    expect(screen.queryByText(/已选/)).not.toBeInTheDocument();
  });

  it("clears selection on × click", async () => {
    const user = userEvent.setup();
    render(<WorkspaceProvider><WithSelection /></WorkspaceProvider>);
    await user.click(screen.getByRole("button", { name: "清除选区" }));
    expect(screen.queryByText(/已选/)).not.toBeInTheDocument();
  });
});
