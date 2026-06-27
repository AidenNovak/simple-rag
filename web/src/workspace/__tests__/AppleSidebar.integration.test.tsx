import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { WorkspaceProvider } from "../WorkspaceStore.js";
import { WorkspaceLayout } from "../layout/WorkspaceLayout.js";

vi.mock("../../api.js", () => ({
  api: {
    listDocs: vi.fn().mockResolvedValue({ documents: [{ id: "n1", title: "N", kind: "note", status: "pending" }] }),
    listConversations: vi.fn().mockResolvedValue({ conversations: [{ id: "c1", title: "C" }] }),
    getMessages: vi.fn().mockResolvedValue({ messages: [] }),
    getDoc: vi.fn().mockResolvedValue({ document: { id: "n1", title: "N", contentMd: "", kind: "note" } }),
  },
  getToken: () => "t",
}));
vi.mock("../EditorPane.js", () => ({ EditorPane: () => <div /> }));
vi.mock("../ChatPane.js", () => ({ ChatPane: () => <div data-testid="chat" /> }));
vi.mock("../craft/CraftBody.js", () => ({ CraftBody: () => null }));
vi.mock("../craft/SourcePeek.js", () => ({ SourcePeek: () => null }));
vi.mock("../craft/scrollToSnippet.js", () => ({ scrollCraftToSnippet: () => false }));
vi.mock("../SelectionContextBar.js", () => ({ SelectionContextBar: () => null }));
vi.mock("../../components/Toast.js", () => ({ useToast: () => () => {} }));
vi.mock("../../components/DocPreview.js", () => ({ DocPreview: () => null }));

describe("Apple sidebar integration", () => {
  it("SV1+SV4: brand in sidebar only", async () => {
    render(
      <WorkspaceProvider>
        <WorkspaceLayout topbar={<span data-testid="top">tools</span>} />
      </WorkspaceProvider>
    );
    expect(await screen.findByText("meimaobing")).toBeInTheDocument();
    expect(screen.getByTestId("top")).not.toHaveTextContent("meimaobing");
  });
});
