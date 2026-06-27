import { render } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { WorkspaceProvider } from "../WorkspaceStore.js";
import { WorkspaceLayout } from "../layout/WorkspaceLayout.js";

vi.mock("../FileTree.js", () => ({ FileTree: () => <div data-testid="file-tree" /> }));
vi.mock("../EditorPane.js", () => ({ EditorPane: () => <div data-testid="editor-pane" /> }));
vi.mock("../ChatPane.js", () => ({ ChatPane: () => <div data-testid="chat-pane" /> }));

describe("WorkspaceLayout grid", () => {
  it("renders exactly three data-pane nodes and two resizers", () => {
    const { container } = render(
      <WorkspaceProvider>
        <WorkspaceLayout chatModel={null} />
      </WorkspaceProvider>
    );
    const root = container.querySelector(".workspace-root")!;
    expect(root.querySelectorAll("[data-pane]")).toHaveLength(3);
    expect(root.querySelectorAll(".workspace-resizer-left, .workspace-resizer-right")).toHaveLength(2);
    expect(root.querySelector('[data-pane="left"]')).toBeTruthy();
    expect(root.querySelector('[data-pane="center"]')).toBeTruthy();
    expect(root.querySelector('[data-pane="right"]')).toBeTruthy();
  });
});
