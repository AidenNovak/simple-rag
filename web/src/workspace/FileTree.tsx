import { useEffect, useRef, useState } from "react";
import { api } from "../api.js";
import { useWorkspace } from "./WorkspaceStore.js";
import { IconNote, IconFile, IconPlus, IconTrash, IconUpload } from "../Icons.js";
import { useToast } from "../components/Toast.js";

interface DocRow {
  id: string;
  title: string;
  kind: "note" | "file";
  status: string;
  createdAt: string;
}
interface ConvoRow { id: string; title: string; }

/** 左栏：文档/笔记列表 + 对话列表 + 新建/删除/上传入口。 */
export function FileTree() {
  const { state, dispatch } = useWorkspace();
  const toast = useToast();
  const [docs, setDocs] = useState<DocRow[]>([]);
  const [convos, setConvos] = useState<ConvoRow[]>([]);
  const [loading, setLoading] = useState(true);
  const fileInput = useRef<HTMLInputElement>(null);

  const load = async () => {
    setLoading(true);
    try {
      const [dr, cr] = await Promise.all([api.listDocs(), api.listConversations()]);
      setDocs((dr.documents || []) as DocRow[]);
      setConvos((cr.conversations || []) as ConvoRow[]);
    } catch { /* ignore */ } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const notes = docs.filter((d) => d.kind === "note");
  const files = docs.filter((d) => d.kind !== "note");

  const openDoc = async (d: DocRow) => {
    try {
      const r = await api.getDoc(d.id);
      const doc = r.document;
      dispatch({
        type: "SET_ACTIVE_DOC",
        payload: { id: doc.id, title: doc.title, content: doc.contentMd || "", kind: doc.kind === "note" ? "note" : "upload" },
      });
    } catch { toast("error", "打开失败"); }
  };

  const newNote = async () => {
    try {
      // 服务端要求 title/content 非空；用占位种子创建，用户进入后可改。
      const r = await api.createNote("未命名笔记", "（开始编辑…）");
      const doc = r.document;
      setDocs((ds) => [{ id: doc.id, title: doc.title, kind: "note", status: doc.status, createdAt: doc.createdAt }, ...ds]);
      dispatch({ type: "SET_ACTIVE_DOC", payload: { id: doc.id, title: doc.title, content: "", kind: "note" } });
    } catch { toast("error", "新建失败"); }
  };

  const del = async (d: DocRow) => {
    if (!confirm(`删除「${d.title}」？`)) return;
    try {
      await api.deleteDoc(d.id);
      setDocs((ds) => ds.filter((x) => x.id !== d.id));
      if (state.activeDocId === d.id) dispatch({ type: "SET_ACTIVE_DOC", payload: { id: "", title: "", content: "", kind: "note" } });
      toast("success", "已删除");
    } catch { toast("error", "删除失败"); }
  };

  const upload = async (f: File) => {
    try {
      await api.upload(f);
      toast("success", "已上传");
      load();
    } catch { toast("error", "上传失败"); }
  };

  const openConvo = (id: string) => dispatch({ type: "SET_CONVO", payload: id });

  const Row = ({ d }: { d: DocRow }) => (
    <div
      key={d.id}
      className={`ws-tree-row ${state.activeDocId === d.id ? "active" : ""}`}
      data-testid="tree-row"
      onClick={() => openDoc(d)}
      title={d.title}
    >
      <span className="ws-tree-icon">{d.kind === "note" ? <IconNote size={14} /> : <IconFile size={14} />}</span>
      <span className="ws-tree-label">{d.title}</span>
      {d.status !== "ready" && <span className="ws-tree-status" title={d.status}>{d.status === "failed" ? "⚠" : "⏳"}</span>}
      <button className="ws-tree-del" title="删除" onClick={(e) => { e.stopPropagation(); del(d); }}><IconTrash size={12} /></button>
    </div>
  );

  return (
    <div className="ws-filetree" data-testid="file-tree">
      <div className="ws-tree-actions">
        <button className="btn" onClick={newNote} style={{ flex: 1, fontSize: 13 }}><IconPlus size={13} /> 新建笔记</button>
        <button className="btn-secondary" onClick={() => fileInput.current?.click()} title="上传文件" style={{ fontSize: 13 }}>
          <IconUpload size={13} />
        </button>
        <input
          ref={fileInput}
          type="file"
          style={{ display: "none" }}
          accept=".pdf,.docx,.doc,.pptx,.xlsx,.xls,.csv,.md,.markdown,.txt,.html,.htm,.epub"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); e.target.value = ""; }}
        />
      </div>

      {loading && <div className="muted" style={{ padding: 12, fontSize: 12 }}>加载中…</div>}

      {notes.length > 0 && (
        <div className="ws-tree-group">
          <div className="ws-tree-group-label">📝 笔记 ({notes.length})</div>
          {notes.map((d) => <Row key={d.id} d={d} />)}
        </div>
      )}
      {files.length > 0 && (
        <div className="ws-tree-group">
          <div className="ws-tree-group-label">📄 文件 ({files.length})</div>
          {files.map((d) => <Row key={d.id} d={d} />)}
        </div>
      )}

      {convos.length > 0 && (
        <div className="ws-tree-group">
          <div className="ws-tree-group-label">💬 对话 ({convos.length})</div>
          {convos.map((c) => (
            <div
              key={c.id}
              className={`ws-tree-row convo ${state.convoId === c.id ? "active" : ""}`}
              onClick={() => openConvo(c.id)}
              title={c.title}
            >
              <span className="ws-tree-label">{c.title}</span>
            </div>
          ))}
        </div>
      )}

      {!loading && docs.length === 0 && convos.length === 0 && (
        <div className="muted" style={{ padding: 16, textAlign: "center", fontSize: 12 }}>空空如也</div>
      )}
    </div>
  );
}
