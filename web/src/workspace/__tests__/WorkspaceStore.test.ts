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
});
