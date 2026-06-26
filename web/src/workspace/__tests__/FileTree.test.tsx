import { render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { WorkspaceProvider } from "../WorkspaceStore.js";
import { FileTree } from "../FileTree.js";

vi.mock("../../api.js", () => ({
  api: {
    listDocs: vi.fn().mockResolvedValue({
      documents: [
        { id: "n1", title: "My Note", kind: "note", status: "ready", createdAt: "2026-01-01" },
        { id: "u1", title: "paper.pdf", kind: "file", status: "ready", createdAt: "2026-01-02" },
      ],
    }),
    getDoc: vi.fn().mockResolvedValue({ document: { id: "n1", title: "My Note", contentMd: "# Hi", kind: "note" } }),
    createNote: vi.fn(),
    upload: vi.fn(),
    deleteDoc: vi.fn(),
    listConversations: vi.fn().mockResolvedValue({ conversations: [] }),
  },
  getToken: () => "x",
}));

describe("FileTree", () => {
  beforeEach(() => vi.clearAllMocks());

  it("lists notes and uploads", async () => {
    render(<WorkspaceProvider><FileTree /></WorkspaceProvider>);
    expect(await screen.findByText("My Note")).toBeInTheDocument();
    expect(screen.getByText("paper.pdf")).toBeInTheDocument();
  });

  it("has a create-note button", async () => {
    render(<WorkspaceProvider><FileTree /></WorkspaceProvider>);
    await screen.findByText("My Note");
    expect(screen.getByRole("button", { name: /新建笔记/ })).toBeInTheDocument();
  });
});
