import { render, screen } from "@testing-library/react";
import { useEffect } from "react";
import { describe, it, expect, vi } from "vitest";
import { WorkspaceProvider, useWorkspace } from "../WorkspaceStore.js";
import { EditorPane } from "../EditorPane.js";
import { scrollCraftToSnippet } from "../craft/scrollToSnippet.js";

vi.mock("../../api.js", () => ({ api: { updateNote: vi.fn().mockResolvedValue({ ok: true }) }, getToken: () => "x" }));
vi.mock("../../components/Toast.js", () => ({ useToast: () => () => {} }));
vi.mock("../../components/DocPreview.js", () => ({ DocPreview: () => null }));
vi.mock("../SelectionContextBar.js", () => ({ SelectionContextBar: () => null }));
vi.mock("markstream-react", () => ({ default: ({ content }: any) => <div>{content}</div> }));

function Seed() {
  const { dispatch } = useWorkspace();
  useEffect(() => {
    dispatch({ type: "SET_ACTIVE_DOC", payload: { id: "1", title: "T", content: "hello world snippet here", kind: "note" } });
  }, [dispatch]);
  return <EditorPane />;
}

describe("Live Craft integration", () => {
  it("EV1: no preview/edit buttons", () => {
    render(<WorkspaceProvider><Seed /></WorkspaceProvider>);
    expect(screen.queryByRole("button", { name: /预览|编辑/ })).toBeNull();
    expect(screen.getByTestId("craft-body")).toBeInTheDocument();
  });

  it("EV2: scroll-to event reaches craft and flashes", () => {
    render(<WorkspaceProvider><Seed /></WorkspaceProvider>);
    const el = document.createElement("div");
    const ok = scrollCraftToSnippet(el, "hello world snippet here", "snippet");
    expect(ok).toBe(true);
    expect(el.classList.contains("ws-snippet-flash")).toBe(true);
  });
});
