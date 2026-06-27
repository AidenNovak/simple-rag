import { render, screen, fireEvent } from "@testing-library/react";
import { useEffect } from "react";
import { describe, it, expect, vi } from "vitest";
import { WorkspaceProvider, useWorkspace } from "../WorkspaceStore.js";
import { EditorPane } from "../EditorPane.js";

vi.mock("../../api.js", () => ({
  api: { updateNote: vi.fn().mockResolvedValue({ ok: true }), createNote: vi.fn() },
  getToken: () => "x",
}));
vi.mock("../../components/Toast.js", () => ({ useToast: () => () => {} }));
vi.mock("../../components/DocPreview.js", () => ({ DocPreview: () => null }));
vi.mock("../SelectionContextBar.js", () => ({ SelectionContextBar: () => null }));
vi.mock("../craft/CraftBody.js", () => ({
  CraftBody: ({ content, onOpenPeek }: any) => (
    <div data-testid="craft-body" onDoubleClick={onOpenPeek}>{content}</div>
  ),
}));
vi.mock("../craft/SourcePeek.js", () => ({
  SourcePeek: ({ open }: { open: boolean }) => (open ? <div data-testid="source-peek" /> : null),
}));

function Seed({ children }: { children: React.ReactNode }) {
  const { dispatch } = useWorkspace();
  useEffect(() => {
    dispatch({ type: "SET_ACTIVE_DOC", payload: { id: "n1", title: "T", content: "body", kind: "note" } });
  }, [dispatch]);
  return <>{children}</>;
}

describe("EditorPane Live Craft", () => {
  it("shows craft body by default without preview toggle", () => {
    render(
      <WorkspaceProvider>
        <Seed><EditorPane /></Seed>
      </WorkspaceProvider>
    );
    expect(screen.getByTestId("craft-body")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /预览|编辑/ })).toBeNull();
  });

  it("opens source peek on double-click craft", () => {
    render(
      <WorkspaceProvider>
        <Seed><EditorPane /></Seed>
      </WorkspaceProvider>
    );
    fireEvent.doubleClick(screen.getByTestId("craft-body"));
    expect(screen.getByTestId("source-peek")).toBeInTheDocument();
  });

  it("listens workspace:scroll-to on craft container", () => {
    render(
      <WorkspaceProvider>
        <Seed><EditorPane /></Seed>
      </WorkspaceProvider>
    );
    window.dispatchEvent(new CustomEvent("workspace:scroll-to", { detail: "body" }));
    expect(screen.getByTestId("craft-body")).toBeInTheDocument();
  });
});
