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
  contextDocIds: string[];
  contextDocTitles: Record<string, string>;
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
  contextDocIds: [],
  contextDocTitles: {},
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
          contextDocIds: [action.payload.id],
          contextDocTitles: { [action.payload.id]: action.payload.title },
        };
      }
      return base;
    }
    case "TOGGLE_CONTEXT_DOC": {
      const { id, title } = action.payload;
      const has = state.contextDocIds.includes(id);
      const nextIds = has ? state.contextDocIds.filter((x) => x !== id) : [...state.contextDocIds, id];
      const nextTitles = { ...state.contextDocTitles };
      if (has) delete nextTitles[id];
      else nextTitles[id] = title;
      return { ...state, contextDocIds: nextIds, contextDocTitles: nextTitles };
    }
    case "CLEAR_CONTEXT_DOC":
      return { ...state, contextDocIds: [], contextDocTitles: {} };
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
