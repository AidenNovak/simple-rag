import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { WorkspaceProvider } from "../WorkspaceStore.js";
import { ChatPane } from "../ChatPane.js";

vi.mock("../../api.js", () => ({
  api: {
    listDocs: vi.fn().mockResolvedValue({
      documents: [
        { id: "n1", title: "A", kind: "note", status: "pending" },
        { id: "n2", title: "B", kind: "note", status: "pending" },
      ],
    }),
    listConversations: vi.fn().mockResolvedValue({ conversations: [] }),
    getMessages: vi.fn().mockResolvedValue({ messages: [] }),
  },
  getToken: () => "t",
}));
vi.mock("markstream-react", () => ({ default: () => null, TextNode: () => null }));
vi.mock("../../components/Toast.js", () => ({ useToast: () => () => {} }));
vi.mock("../ScopeDropdown.js", () => ({ ScopeDropdown: () => null }));
vi.mock("../FilePeekPanel.js", () => ({ FilePeekPanel: () => null }));

describe("ChatPane doc count", () => {
  it("shows note total when none ready", async () => {
    render(<WorkspaceProvider><ChatPane /></WorkspaceProvider>);
    expect(await screen.findByText(/2 笔记/)).toBeInTheDocument();
    expect(screen.getByText(/0 可检索/)).toBeInTheDocument();
  });
});
