import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { WorkspaceProvider } from "../WorkspaceStore.js";
import { FileTree } from "../FileTree.js";

vi.mock("../../api.js", () => ({
  api: {
    listDocs: vi.fn().mockResolvedValue({
      documents: [
        { id: "n1", title: "Note A", kind: "note", status: "pending", createdAt: "x" },
        { id: "n2", title: "Note B", kind: "note", status: "failed", createdAt: "x" },
      ],
    }),
    listConversations: vi.fn().mockResolvedValue({ conversations: [] }),
    getDoc: vi.fn(),
    createNote: vi.fn(),
    upload: vi.fn(),
    deleteDoc: vi.fn(),
  },
  getToken: () => "x",
}));
vi.mock("../SidebarSection.js", () => ({
  SidebarSection: ({ children }: any) => <div>{children}</div>,
}));

describe("UI polish v2 integration", () => {
  it("UV1: FileTree uses Badge (no emoji) for pending + failed", async () => {
    render(<WorkspaceProvider><FileTree /></WorkspaceProvider>);
    expect(await screen.findByText("处理中")).toBeInTheDocument();
    expect(screen.getByText("失败")).toBeInTheDocument();
    expect(screen.queryByText("⏳")).not.toBeInTheDocument();
    expect(screen.queryByText("⚠")).not.toBeInTheDocument();
  });
});
