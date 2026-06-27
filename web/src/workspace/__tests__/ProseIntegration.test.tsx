import { render, screen } from "@testing-library/react";
import { useEffect } from "react";
import { describe, it, expect, vi } from "vitest";
import { WorkspaceProvider, useWorkspace } from "../WorkspaceStore.js";
import { EditorPane } from "../EditorPane.js";

vi.mock("../../api.js", () => ({ api: { updateNote: vi.fn().mockResolvedValue({ ok: true }) }, getToken: () => "x" }));
vi.mock("../../components/Toast.js", () => ({ useToast: () => () => {} }));
vi.mock("../../components/DocPreview.js", () => ({ DocPreview: () => null }));
vi.mock("../SelectionContextBar.js", () => ({ SelectionContextBar: () => null }));
vi.mock("markstream-react", () => ({ default: ({ content }: any) => <div>{content}</div> }));
vi.mock("../../theme/useMarkstreamDark.js", () => ({ useMarkstreamDark: () => false }));

function Seed() {
  const { dispatch } = useWorkspace();
  useEffect(() => {
    dispatch({
      type: "SET_ACTIVE_DOC",
      payload: {
        id: "1", title: "T",
        content: "# 标题一\n\n## 章节 A\n\n正文段落。\n\n## 章节 B\n\n另一段。",
        kind: "note",
      },
    });
  }, [dispatch]);
  return <EditorPane />;
}

describe("Prose integration", () => {
  it("PV4: shows TOC for content with 3+ headings", () => {
    render(<WorkspaceProvider><Seed /></WorkspaceProvider>);
    expect(screen.getByTestId("toc-panel")).toBeInTheDocument();
  });

  it("PO4: shows writing stats with word count", () => {
    render(<WorkspaceProvider><Seed /></WorkspaceProvider>);
    const stats = screen.getByText(/字.*分钟.*段/);
    expect(stats).toBeInTheDocument();
  });
});
