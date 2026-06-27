export interface WorkspaceDoc {
  id: string;
  title: string;
  kind: "note" | "upload";
  status: "pending" | "ready" | "error";
  createdAt: string;
}

export interface Selection {
  docId: string;
  text: string;
  start: number;
  end: number;
}

export interface LayoutPrefs {
  leftWidth: number;
  rightWidth: number;
  leftCollapsed: boolean;
}

export interface PendingPatch {
  docId: string;
  title?: string;
  content: string;
  previousContent: string;
}

export type WorkspaceAction =
  | { type: "SET_ACTIVE_DOC"; payload: { id: string; title: string; content: string; kind: WorkspaceDoc["kind"] } }
  | { type: "SET_DRAFT_TITLE"; payload: string }
  | { type: "SET_DRAFT_CONTENT"; payload: string }
  | { type: "MARK_CLEAN" }
  | { type: "SET_SELECTION"; payload: Selection | null }
  | { type: "CLEAR_SELECTION" }
  | { type: "SET_CONVO"; payload: string | null }
  | { type: "SET_SCOPE"; payload: string[] | null }
  | { type: "SET_LAYOUT"; payload: Partial<LayoutPrefs> }
  | { type: "SET_PENDING_PATCH"; payload: PendingPatch | null }
  | { type: "SET_CONTEXT_DOC"; payload: { id: string; title: string } }
  | { type: "CLEAR_CONTEXT_DOC" };
