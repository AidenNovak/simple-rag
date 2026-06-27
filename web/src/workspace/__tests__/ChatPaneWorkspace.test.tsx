import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import { WorkspaceProvider } from "../WorkspaceStore.js";
import { ChatPane } from "../ChatPane.js";

vi.mock("../../api.js", () => ({
  api: {
    listDocs: vi.fn().mockResolvedValue({
      documents: [
        { id: "n1", title: "Note A", kind: "note", status: "ready" },
        { id: "n2", title: "Note B", kind: "note", status: "ready" },
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

describe("ChatPane context picker", () => {
  it("empty state shows reference note picker", async () => {
    render(<WorkspaceProvider><ChatPane /></WorkspaceProvider>);
    expect(await screen.findByTestId("ref-note-picker")).toBeInTheDocument();
    expect(screen.getByText("选择参考笔记")).toBeInTheDocument();
  });

  it("selecting note sets context without requiring activeDoc", async () => {
    const user = userEvent.setup();
    render(<WorkspaceProvider><ChatPane /></WorkspaceProvider>);
    await user.click(await screen.findByRole("button", { name: /Note B/ }));
    expect(screen.getByTestId("context-ref-bar")).toHaveTextContent("参考：Note B");
  });
});
