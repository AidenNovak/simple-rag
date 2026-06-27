import { describe, it, expect } from "vitest";
import { workspaceReducer, initialWorkspaceState } from "../WorkspaceStore.js";

describe("workspaceReducer", () => {
  it("marks dirty when draft content changes", () => {
    const s = workspaceReducer(initialWorkspaceState, {
      type: "SET_DRAFT_CONTENT",
      payload: "hello",
    });
    expect(s.dirty).toBe(true);
    expect(s.draftContent).toBe("hello");
  });

  it("sets selection from editor", () => {
    const s = workspaceReducer(initialWorkspaceState, {
      type: "SET_SELECTION",
      payload: { docId: "d1", text: "picked text", start: 0, end: 11 },
    });
    expect(s.selection?.text).toBe("picked text");
  });

  it("clears selection on CLEAR_SELECTION", () => {
    const withSel = { ...initialWorkspaceState, selection: { docId: "d1", text: "x", start: 0, end: 1 } };
    const s = workspaceReducer(withSel, { type: "CLEAR_SELECTION" });
    expect(s.selection).toBeNull();
  });

  it("sets scope to active doc on SET_ACTIVE_DOC", () => {
    const s = workspaceReducer(initialWorkspaceState, {
      type: "SET_ACTIVE_DOC",
      payload: { id: "d2", title: "T", content: "c", kind: "note" },
    });
    expect(s.scopeDocIds).toEqual(["d2"]);
    expect(s.activeDocId).toBe("d2");
    expect(s.dirty).toBe(false);
  });

  it("persists layout to localStorage on SET_LAYOUT", () => {
    workspaceReducer(initialWorkspaceState, { type: "SET_LAYOUT", payload: { leftWidth: 300 } });
    const raw = localStorage.getItem("kb.workspace.layout");
    expect(raw).toBeTruthy();
    expect(JSON.parse(raw!).leftWidth).toBe(300);
  });

  it("TOGGLE_CONTEXT_DOC adds a context note", () => {
    const s = workspaceReducer(initialWorkspaceState, {
      type: "TOGGLE_CONTEXT_DOC",
      payload: { id: "n9", title: "Ref Note" },
    });
    expect(s.contextDocIds).toEqual(["n9"]);
    expect(s.contextDocTitles).toEqual({ n9: "Ref Note" });
    expect(s.activeDocId).toBeNull();
  });

  it("TOGGLE_CONTEXT_DOC removes an already-selected note", () => {
    const withOne = workspaceReducer(initialWorkspaceState, {
      type: "TOGGLE_CONTEXT_DOC",
      payload: { id: "n1", title: "A" },
    });
    const s = workspaceReducer(withOne, {
      type: "TOGGLE_CONTEXT_DOC",
      payload: { id: "n1", title: "A" },
    });
    expect(s.contextDocIds).toEqual([]);
    expect(s.contextDocTitles).toEqual({});
  });

  it("TOGGLE_CONTEXT_DOC keeps multiple selections", () => {
    const s1 = workspaceReducer(initialWorkspaceState, {
      type: "TOGGLE_CONTEXT_DOC", payload: { id: "n1", title: "A" },
    });
    const s2 = workspaceReducer(s1, {
      type: "TOGGLE_CONTEXT_DOC", payload: { id: "n2", title: "B" },
    });
    expect(s2.contextDocIds).toEqual(["n1", "n2"]);
    expect(s2.contextDocTitles).toEqual({ n1: "A", n2: "B" });
  });

  it("SET_ACTIVE_DOC note syncs contextDocIds", () => {
    const s = workspaceReducer(initialWorkspaceState, {
      type: "SET_ACTIVE_DOC",
      payload: { id: "d2", title: "T", content: "c", kind: "note" },
    });
    expect(s.contextDocIds).toEqual(["d2"]);
    expect(s.contextDocTitles).toEqual({ d2: "T" });
  });

  it("SET_ACTIVE_DOC upload does not change contextDocIds", () => {
    const withCtx = workspaceReducer(initialWorkspaceState, {
      type: "TOGGLE_CONTEXT_DOC",
      payload: { id: "n1", title: "Keep" },
    });
    const s = workspaceReducer(withCtx, {
      type: "SET_ACTIVE_DOC",
      payload: { id: "f1", title: "File", content: "", kind: "upload" },
    });
    expect(s.contextDocIds).toEqual(["n1"]);
    expect(s.activeDocId).toBe("f1");
  });

  it("CLEAR_CONTEXT_DOC clears context fields", () => {
    const withCtx = workspaceReducer(initialWorkspaceState, {
      type: "TOGGLE_CONTEXT_DOC",
      payload: { id: "n1", title: "X" },
    });
    const s = workspaceReducer(withCtx, { type: "CLEAR_CONTEXT_DOC" });
    expect(s.contextDocIds).toEqual([]);
    expect(s.contextDocTitles).toEqual({});
  });
});
