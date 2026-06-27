import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import { WorkspaceProvider } from "../WorkspaceStore.js";
import { ChatPane } from "../ChatPane.js";

vi.mock("../../api.js", () => ({
  api: {
    listDocs: vi.fn().mockResolvedValue({
      documents: [{ id: "n1", title: "Only", kind: "note", status: "ready" }],
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

describe("Chat context integration", () => {
  it("CV1+CV3: picker selects note and shows context ref bar", async () => {
    const user = userEvent.setup();
    render(<WorkspaceProvider><ChatPane /></WorkspaceProvider>);
    await user.click(await screen.findByRole("button", { name: /Only/ }));
    expect(screen.getByTestId("context-ref-bar")).toHaveTextContent("参考：Only");
  });
});
