import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { WorkspaceProvider } from "../WorkspaceStore.js";
import { FileTree } from "../FileTree.js";

vi.mock("../../api.js", () => ({
  api: {
    listDocs: vi.fn().mockResolvedValue({
      documents: [
        { id: "n1", title: "My Note", kind: "note", status: "pending", createdAt: "2026-01-01" },
        { id: "u1", title: "paper.pdf", kind: "file", status: "ready", createdAt: "2026-01-02" },
      ],
    }),
    getDoc: vi.fn().mockResolvedValue({ document: { id: "n1", title: "My Note", contentMd: "# Hi", kind: "note" } }),
    createNote: vi.fn().mockResolvedValue({ document: { id: "n2", title: "未命名笔记", status: "pending", createdAt: "2026-01-03" } }),
    upload: vi.fn(),
    deleteDoc: vi.fn(),
    listConversations: vi.fn().mockResolvedValue({ conversations: [{ id: "c1", title: "Hello" }] }),
  },
  getToken: () => "x",
}));

describe("FileTree", () => {
  beforeEach(() => vi.clearAllMocks());

  it("lists notes, files and conversations", async () => {
    render(<WorkspaceProvider><FileTree /></WorkspaceProvider>);
    expect(await screen.findByText("My Note")).toBeInTheDocument();
    expect(screen.getByText("paper.pdf")).toBeInTheDocument();
    expect(screen.getByText("Hello")).toBeInTheDocument();
  });

  it("shows meimaobing brand without top create button", async () => {
    render(<WorkspaceProvider><FileTree /></WorkspaceProvider>);
    expect(await screen.findByText("meimaobing")).toBeInTheDocument();
    // section action（icon-btn，aria-label=新建笔记）存在，但不应有大块 .btn 新建按钮
    expect(screen.getByRole("button", { name: "新建笔记" })).toHaveClass("icon-btn");
    expect(document.querySelector(".ws-tree-actions")).toBeNull();
  });

  it("new conversation via section action button", async () => {
    const user = userEvent.setup();
    render(<WorkspaceProvider><FileTree /></WorkspaceProvider>);
    await screen.findByText("Hello");
    await user.click(screen.getByRole("button", { name: "新建对话" }));
    expect(document.querySelector(".ws-tree-row.active-convo")).toBeNull();
  });
});
