import { createContext, useContext, useReducer, type ReactNode } from "react";
import type { LayoutPrefs, PendingPatch, Selection, WorkspaceAction, WorkspaceDoc } from "./types.js";

export interface WorkspaceState {
  activeDocId: string | null;
  activeDocKind: WorkspaceDoc["kind"] | null;
  draftTitle: string;
  draftContent: string;
  dirty: boolean;
  selection: Selection | null;
  convoId: string | null;
  scopeDocIds: string[] | null;
  layout: LayoutPrefs;
  pendingPatch: PendingPatch | null;
  contextDocId: string | null;
  contextDocTitle: string | null;
}

const DEFAULT_LAYOUT: LayoutPrefs = { leftWidth: 240, rightWidth: 380, leftCollapsed: false };

export const initialWorkspaceState: WorkspaceState = {
  activeDocId: null,
  activeDocKind: null,
  draftTitle: "",
  draftContent: "",
  dirty: false,
  selection: null,
  convoId: null,
  scopeDocIds: null,
  layout: loadLayout(),
  pendingPatch: null,
  contextDocId: null,
  contextDocTitle: null,
};

function loadLayout(): LayoutPrefs {
  try {
    const raw = localStorage.getItem("kb.workspace.layout");
    if (!raw) return DEFAULT_LAYOUT;
    return { ...DEFAULT_LAYOUT, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_LAYOUT;
  }
}

export function workspaceReducer(state: WorkspaceState, action: WorkspaceAction): WorkspaceState {
  switch (action.type) {
    case "SET_ACTIVE_DOC": {
      const base = {
        ...state,
        activeDocId: action.payload.id,
        activeDocKind: action.payload.kind,
        draftTitle: action.payload.title,
        draftContent: action.payload.content,
        dirty: false,
        selection: null,
        scopeDocIds: [action.payload.id],
      };
      if (action.payload.kind === "note") {
        return {
          ...base,
          contextDocId: action.payload.id,
          contextDocTitle: action.payload.title,
        };
      }
      return base;
    }
    case "SET_CONTEXT_DOC":
      return {
        ...state,
        contextDocId: action.payload.id,
        contextDocTitle: action.payload.title,
      };
    case "CLEAR_CONTEXT_DOC":
      return { ...state, contextDocId: null, contextDocTitle: null };
    case "SET_DRAFT_TITLE":
      return { ...state, draftTitle: action.payload, dirty: true };
    case "SET_DRAFT_CONTENT":
      return { ...state, draftContent: action.payload, dirty: true };
    case "MARK_CLEAN":
      return { ...state, dirty: false };
    case "SET_SELECTION":
      return { ...state, selection: action.payload };
    case "CLEAR_SELECTION":
      return { ...state, selection: null };
    case "SET_CONVO":
      return { ...state, convoId: action.payload };
    case "SET_SCOPE":
      return { ...state, scopeDocIds: action.payload };
    case "SET_LAYOUT": {
      const layout = { ...state.layout, ...action.payload };
      try { localStorage.setItem("kb.workspace.layout", JSON.stringify(layout)); } catch {}
      return { ...state, layout };
    }
    case "SET_PENDING_PATCH":
      return { ...state, pendingPatch: action.payload };
    default: {
      const _exhaustive: never = action;
      return state;
    }
  }
}

const Ctx = createContext<{ state: WorkspaceState; dispatch: React.Dispatch<WorkspaceAction> } | null>(null);

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(workspaceReducer, initialWorkspaceState);
  return <Ctx.Provider value={{ state, dispatch }}>{children}</Ctx.Provider>;
}

export function useWorkspace() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useWorkspace outside provider");
  return v;
}
