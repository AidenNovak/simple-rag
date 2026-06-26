import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { WorkspaceProvider } from "../WorkspaceStore.js";
import { WorkspaceShell } from "../WorkspaceShell.js";

vi.mock("../FileTree.js", () => ({ FileTree: () => <div data-testid="file-tree" /> }));
vi.mock("../EditorPane.js", () => ({ EditorPane: () => <div data-testid="editor-pane" /> }));
vi.mock("../ChatPane.js", () => ({ ChatPane: () => <div data-testid="chat-pane" /> }));
vi.mock("../CommandPalette.js", () => ({ CommandPalette: () => null }));

describe("WorkspaceShell", () => {
  it("renders three columns and topbar on desktop", () => {
    render(
      <WorkspaceProvider>
        <WorkspaceShell user={{ email: "a@b.com" }} onOpenSettings={() => {}} />
      </WorkspaceProvider>
    );
    expect(screen.getByTestId("file-tree")).toBeInTheDocument();
    expect(screen.getByTestId("editor-pane")).toBeInTheDocument();
    expect(screen.getByTestId("chat-pane")).toBeInTheDocument();
    expect(screen.getByRole("banner")).toHaveTextContent("私人知识库");
  });
});
