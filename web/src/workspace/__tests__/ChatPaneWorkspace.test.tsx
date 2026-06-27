import { render, screen } from "@testing-library/react";
import { useEffect } from "react";
import { describe, it, expect, vi } from "vitest";
import { WorkspaceProvider, useWorkspace } from "../WorkspaceStore.js";
import { ChatPane } from "../ChatPane.js";

vi.mock("../../api.js", () => ({
  api: {
    listDocs: vi.fn().mockResolvedValue({ documents: [{ id: "1", title: "N", status: "ready" }] }),
    listConversations: vi.fn().mockResolvedValue({ conversations: [] }),
    getMessages: vi.fn().mockResolvedValue({ messages: [] }),
  },
  getToken: () => "t",
}));
vi.mock("markstream-react", () => ({ default: () => null, TextNode: () => null }));
vi.mock("../../components/DocPreview.js", () => ({ DocPreview: () => null }));
vi.mock("../../components/Toast.js", () => ({ useToast: () => () => {} }));
vi.mock("../ScopeDropdown.js", () => ({ ScopeDropdown: () => null }));
vi.mock("../FilePeekPanel.js", () => ({ FilePeekPanel: () => null }));

function Seed({ title, children }: { title: string; children: React.ReactNode }) {
  const { dispatch } = useWorkspace();
  useEffect(() => {
    dispatch({ type: "SET_ACTIVE_DOC", payload: { id: "n1", title, content: "body", kind: "note" } });
  }, [dispatch, title]);
  return <>{children}</>;
}

describe("ChatPane workspace copy", () => {
  it("empty state mentions current note when activeDoc set", () => {
    render(
      <WorkspaceProvider>
        <Seed title="My Note"><ChatPane /></Seed>
      </WorkspaceProvider>
    );
    expect(screen.getByText(/My Note/)).toBeTruthy();
  });

  it("empty state prompts to select note when no activeDoc", () => {
    render(
      <WorkspaceProvider>
        <ChatPane />
      </WorkspaceProvider>
    );
    expect(screen.getByText(/请先在左侧选择一篇笔记/)).toBeTruthy();
  });
});
