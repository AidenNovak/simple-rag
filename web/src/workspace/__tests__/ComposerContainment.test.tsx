import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { WorkspaceProvider } from "../WorkspaceStore.js";
import { ChatPane } from "../ChatPane.js";

// markstream-react / DocPreview 在 jsdom 下极慢且与本测试无关，stub 掉
vi.mock("markstream-react", () => ({ default: ({ content }: { content: string }) => <div>{content}</div> }));
vi.mock("../../components/DocPreview.js", () => ({ DocPreview: () => null }));
vi.mock("../../api.js", () => ({
  api: {
    listDocs: vi.fn().mockResolvedValue({ documents: [{ id: "1", title: "n", status: "ready" }] }),
    listConversations: vi.fn().mockResolvedValue({ conversations: [] }),
    getMessages: vi.fn().mockResolvedValue({ messages: [] }),
  },
  getToken: () => "t",
}));

describe("ChatPane composer containment", () => {
  it("uses ws-composer-stack instead of composer-wrap", () => {
    render(<WorkspaceProvider><ChatPane /></WorkspaceProvider>);
    expect(document.querySelector(".ws-composer-stack")).toBeTruthy();
    expect(document.querySelector(".composer-wrap")).toBeNull();
  });

  it("composer textarea is inside ws-chat", () => {
    render(<WorkspaceProvider><ChatPane /></WorkspaceProvider>);
    const chat = document.querySelector(".ws-chat")!;
    const ta = screen.getByPlaceholderText(/请先选择左侧笔记|关于|发送消息/);
    expect(chat.contains(ta)).toBe(true);
  });
});
