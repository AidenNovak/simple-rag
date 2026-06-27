import { useEffect, useRef, useState } from "react";
import { api } from "../api.js";
import { useWorkspace } from "./WorkspaceStore.js";
import { IconNote, IconFile, IconTrash, IconUpload } from "../Icons.js";
import { useToast } from "../components/Toast.js";
import { SidebarSection } from "./SidebarSection.js";
import { Badge } from "../ui/index.js";

interface DocRow {
  id: string;
  title: string;
  kind: "note" | "file";
  status: string;
  createdAt: string;
}
interface ConvoRow { id: string; title: string; }

/** Apple 风左栏：meimaobing 品牌 + 笔记/对话/文件分区（section 标题 + trailing +）。 */
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

  // 首条消息创建会话后刷新对话列表
  useEffect(() => {
    const onCreated = () => { load(); };
    window.addEventListener("ws:convo-created", onCreated);
    return () => window.removeEventListener("ws:convo-created", onCreated);
  }, []);

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
      const r = await api.createNote("未命名笔记", "（开始编辑…）");
      const doc = r.document;
      setDocs((ds) => [{ id: doc.id, title: doc.title, kind: "note", status: doc.status, createdAt: doc.createdAt }, ...ds]);
      dispatch({
        type: "SET_ACTIVE_DOC",
        payload: { id: doc.id, title: doc.title, content: doc.contentMd || "（开始编辑…）", kind: "note" },
      });
    } catch { toast("error", "新建失败"); }
  };

  const newConvo = () => dispatch({ type: "SET_CONVO", payload: null });

  const del = async (d: DocRow) => {
    if (!confirm(`删除「${d.title}」？`)) return;
    try {
      await api.deleteDoc(d.id);
      setDocs((ds) => ds.filter((x) => x.id !== d.id));
      if (state.activeDocId === d.id) dispatch({ type: "SET_ACTIVE_DOC", payload: { id: "", title: "", content: "", kind: "note" } });
      toast("success", "已删除");
    } catch { toast("error", "删除失败"); }
  };

  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const upload = async (f: File) => {
    try {
      await api.upload(f);
      toast("success", `已上传「${f.name}」`);
      load();
    } catch { toast("error", `「${f.name}」上传失败`); }
  };
  /** 批量上传：逐个上传,累计成功/失败数。 */
  const uploadMany = async (fileList: FileList | File[]) => {
    const arr = Array.from(fileList);
    if (arr.length === 0) return;
    setUploading(true);
    let ok = 0, fail = 0;
    for (const f of arr) {
      try { await api.upload(f); ok++; } catch { fail++; }
    }
    setUploading(false);
    load();
    if (fail === 0) toast("success", `已上传 ${ok} 个文件`);
    else toast(ok > 0 ? "info" : "error", `${ok} 成功，${fail} 失败`);
  };
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files?.length) uploadMany(e.dataTransfer.files);
  };

  const openConvo = (id: string) => dispatch({ type: "SET_CONVO", payload: id });

  const Row = ({ d }: { d: DocRow }) => (
    <div
      className={`ws-tree-row${state.activeDocId === d.id ? " active-doc" : ""}`}
      data-testid="tree-row"
      onClick={() => openDoc(d)}
      title={d.title}
    >
      <span className="ws-tree-icon">{d.kind === "note" ? <IconNote size={14} /> : <IconFile size={14} />}</span>
      <span className="ws-tree-label">{d.title}</span>
      {d.status !== "ready" && (
        <Badge variant={d.status === "failed" ? "failed" : "pending"} className="ws-tree-status">
          {d.status === "failed" ? "失败" : "处理中"}
        </Badge>
      )}
      <button className="ws-tree-del" title="删除" onClick={(e) => { e.stopPropagation(); del(d); }}><IconTrash size={12} /></button>
    </div>
  );

  return (
    <div className="ws-filetree" data-testid="file-tree">
      <div className="ws-sidebar-brand">meimaobing</div>

      <SidebarSection title="笔记" actionLabel="新建笔记" onAction={newNote}>
        {notes.map((d, i) => (<li key={d.id} className="kb-animate-in" style={{ animationDelay: `${i * 20}ms` }}><Row d={d} /></li>))}
      </SidebarSection>

      <SidebarSection title="对话" actionLabel="新建对话" onAction={newConvo}>
        {convos.map((c, i) => (
          <li key={c.id} className="kb-animate-in" style={{ animationDelay: `${i * 20}ms` }}>
            <div
              className={`ws-tree-row ws-tree-row-convo${state.convoId === c.id ? " active-convo" : ""}`}
              data-testid="tree-row-convo"
              onClick={() => openConvo(c.id)}
              title={c.title}
            >
              <span className="ws-tree-label">{c.title}</span>
            </div>
          </li>
        ))}
      </SidebarSection>

      <div
        className={`ws-drop-zone${dragOver ? " over" : ""}`}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
      >
        <SidebarSection title="文件" actionLabel="上传文件" onAction={() => fileInput.current?.click()} actionIcon={uploading ? "…" : <IconUpload size={14} />}>
          {uploading && (
            <li className="ws-tree-uploading">
              <span className="ws-tree-uploading-dot" /> 上传中…
            </li>
          )}
          {files.length > 0
            ? files.map((d, i) => (<li key={d.id} className="kb-animate-in" style={{ animationDelay: `${i * 20}ms` }}><Row d={d} /></li>))
            : !uploading && (
              <li>
                <button
                  className="ws-tree-upload-empty"
                  data-testid="upload-empty"
                  onClick={() => fileInput.current?.click()}
                  title="点击或拖拽上传 PDF / Word / PPT / Excel / Markdown 等"
                >
                  <IconUpload size={15} />
                  <span>上传文件到知识库</span>
                </button>
              </li>
            )
          }
        </SidebarSection>
      </div>

      <input
        ref={fileInput}
        type="file"
        style={{ display: "none" }}
        accept=".pdf,.docx,.doc,.pptx,.xlsx,.xls,.csv,.md,.markdown,.txt,.html,.htm,.epub"
        onChange={(e) => { if (e.target.files?.length) uploadMany(e.target.files); e.target.value = ""; }}
      />

      {loading && <div className="muted ws-sidebar-loading">加载中…</div>}
      {!loading && docs.length === 0 && convos.length === 0 && (
        <div className="muted ws-sidebar-empty">空空如也</div>
      )}
    </div>
  );
}
