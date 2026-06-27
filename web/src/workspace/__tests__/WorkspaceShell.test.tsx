import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { WorkspaceProvider } from "../WorkspaceStore.js";
import { WorkspaceShell } from "../WorkspaceShell.js";

vi.mock("../FileTree.js", () => ({ FileTree: () => <div data-testid="file-tree-inner" /> }));
vi.mock("../EditorPane.js", () => ({ EditorPane: () => <div data-testid="editor-pane-inner" /> }));
vi.mock("../ChatPane.js", () => ({ ChatPane: () => <div data-testid="chat-pane-inner" /> }));
vi.mock("../CommandPalette.js", () => ({ CommandPalette: () => null }));

describe("WorkspaceShell", () => {
  it("renders three panes (data-pane) and topbar on desktop", () => {
    const { container } = render(
      <WorkspaceProvider>
        <WorkspaceShell user={{ email: "a@b.com" }} onOpenSettings={() => {}} />
      </WorkspaceProvider>
    );
    // 三 pane 容器各一份（唯一）
    expect(container.querySelectorAll("[data-pane]")).toHaveLength(3);
    expect(container.querySelector('[data-pane="left"]')).toBeTruthy();
    expect(container.querySelector('[data-pane="center"]')).toBeTruthy();
    expect(container.querySelector('[data-pane="right"]')).toBeTruthy();
    // 三个真实 pane 组件都被渲染
    expect(screen.getByTestId("file-tree-inner")).toBeInTheDocument();
    expect(screen.getByTestId("editor-pane-inner")).toBeInTheDocument();
    expect(screen.getByTestId("chat-pane-inner")).toBeInTheDocument();
    expect(screen.getByRole("banner")).toHaveTextContent("私人知识库");
  });
});
