import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useEffect } from "react";
import { describe, it, expect, vi } from "vitest";
import { WorkspaceProvider, useWorkspace } from "../WorkspaceStore.js";
import { EditorPane } from "../EditorPane.js";

vi.mock("../../api.js", () => ({
  api: {
    updateNote: vi.fn().mockResolvedValue({ ok: true }),
    createNote: vi.fn(),
  },
  getToken: () => "x",
}));
vi.mock("../../components/Toast.js", () => ({ useToast: () => () => {} }));
// DocPreview / SelectionContextBar 拉入 markstream-react + katex（jsdom 下极慢）— stub 掉。
vi.mock("../../components/DocPreview.js", () => ({ DocPreview: () => null }));
vi.mock("../SelectionContextBar.js", () => ({ SelectionContextBar: () => null }));

function Seed({ children }: { children: React.ReactNode }) {
  const { dispatch } = useWorkspace();
  useEffect(() => {
    dispatch({ type: "SET_ACTIVE_DOC", payload: { id: "n1", title: "T", content: "body", kind: "note" } });
  }, [dispatch]);
  return <>{children}</>;
}

describe("EditorPane", () => {
  it("saves dirty note via PATCH with (id, title, content)", async () => {
    const user = userEvent.setup();
    render(
      <WorkspaceProvider>
        <Seed><EditorPane /></Seed>
      </WorkspaceProvider>
    );
    const ta = screen.getByRole("textbox", { name: /正文/i });
    await user.clear(ta);
    await user.type(ta, "updated");
    await user.click(screen.getByRole("button", { name: "保存" }));
    const { api } = await import("../../api.js");
    expect(api.updateNote).toHaveBeenCalledWith("n1", "T", "updated");
  });
});
