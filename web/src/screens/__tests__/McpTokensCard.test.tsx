import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { McpTokensCard } from "../McpTokensCard.js";

// mock api：避免真实 fetch，专注验证 UI 交互与调用契约
vi.mock("../../api.js", () => ({
  api: {
    listMcpTokens: vi.fn(),
    createMcpToken: vi.fn(),
    revokeMcpToken: vi.fn(),
  },
}));

// mock Toast（组件依赖 ToastProvider context）
vi.mock("../../components/Toast.js", () => ({
  useToast: () => vi.fn(),
}));

import { api } from "../../api.js";

const mockedList = vi.mocked(api.listMcpTokens);
const mockedCreate = vi.mocked(api.createMcpToken);
const mockedRevoke = vi.mocked(api.revokeMcpToken);

beforeEach(() => {
  vi.clearAllMocks();
  mockedList.mockResolvedValue({ tokens: [] });
  mockedCreate.mockResolvedValue({ token: "", id: "", label: "" });
  mockedRevoke.mockResolvedValue({ ok: true });
});

describe("McpTokensCard", () => {
  it("loads and lists existing tokens", async () => {
    mockedList.mockResolvedValue({
      tokens: [
        { id: "t1", label: "Cursor @ MBP", createdAt: "2026-06-01T00:00:00Z", lastUsedAt: "2026-06-20T00:00:00Z" },
      ],
    });
    render(<McpTokensCard />);
    await waitFor(() => {
      expect(screen.getByText("Cursor @ MBP")).toBeInTheDocument();
    });
    expect(screen.getByText(/已有 token（1）/)).toBeInTheDocument();
  });

  it("shows empty state when no tokens", async () => {
    render(<McpTokensCard />);
    await waitFor(() => {
      expect(screen.getByText(/还没有 token/)).toBeInTheDocument();
    });
  });

  it("creates a token and shows plaintext once", async () => {
    const user = userEvent.setup();
    mockedCreate.mockResolvedValue({ token: "abc123plaintext", id: "new1", label: "test" });
    render(<McpTokensCard />);
    await waitFor(() => expect(mockedList).toHaveBeenCalled());

    await user.type(screen.getByPlaceholderText(/标签/), "test");
    await user.click(screen.getByRole("button", { name: /生成 token/ }));

    await waitFor(() => {
      expect(screen.getByText("abc123plaintext")).toBeInTheDocument();
    });
    expect(screen.getByText(/明文仅此一次/)).toBeInTheDocument();
    expect(mockedCreate).toHaveBeenCalledWith("test");
  });

  it("prefills config with newly created token", async () => {
    const user = userEvent.setup();
    mockedCreate.mockResolvedValue({ token: "MYNEW123", id: "n1", label: "x" });
    render(<McpTokensCard />);
    await waitFor(() => expect(mockedList).toHaveBeenCalled());

    await user.click(screen.getByRole("button", { name: /生成 token/ }));
    await waitFor(() => {
      expect(screen.getAllByText(/MYNEW123/).length).toBeGreaterThan(0);
    });
  });

  it("revokes a token after confirm", async () => {
    const user = userEvent.setup();
    mockedList.mockResolvedValue({
      tokens: [{ id: "t1", label: "old", createdAt: "2026-06-01T00:00:00Z", lastUsedAt: null }],
    });
    // 确认对话框
    vi.spyOn(window, "confirm").mockReturnValue(true);
    // revoke 后第二次 list 返回空
    mockedList.mockResolvedValueOnce({ tokens: [{ id: "t1", label: "old", createdAt: "2026-06-01T00:00:00Z", lastUsedAt: null }] });
    mockedList.mockResolvedValueOnce({ tokens: [{ id: "t1", label: "old", createdAt: "2026-06-01T00:00:00Z", lastUsedAt: null }] });
    mockedList.mockResolvedValueOnce({ tokens: [] });

    render(<McpTokensCard />);
    await waitFor(() => expect(screen.getByText("old")).toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: /吊销/ }));
    await waitFor(() => {
      expect(mockedRevoke).toHaveBeenCalledWith("t1");
    });
  });

  it("hides plaintext after close", async () => {
    const user = userEvent.setup();
    mockedCreate.mockResolvedValue({ token: "secret", id: "n1", label: "x" });
    render(<McpTokensCard />);
    await waitFor(() => expect(mockedList).toHaveBeenCalled());

    await user.click(screen.getByRole("button", { name: /生成 token/ }));
    await waitFor(() => expect(screen.getByText("secret")).toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: "关闭" }));
    await waitFor(() => {
      expect(screen.queryByText("secret")).not.toBeInTheDocument();
    });
  });
});
