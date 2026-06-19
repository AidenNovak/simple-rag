import { useState, useEffect } from "react";
import { api, getToken } from "../api.js";
import { useToast } from "../components/Toast.js";
import { IconNote, IconEdit, IconTrash } from "../Icons.js";

async function exportNote(id: string, format: "pdf" | "docx") {
  if (format === "pdf") {
    const note = await api.getDoc(id);
    const content = note.document?.contentMd || "";
    const title = note.document?.title || "笔记";
    const { marked } = await import("marked");
    const html = marked.parse(content);
    const printWin = window.open("", "_blank");
    if (!printWin) return;
    printWin.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>${title}</title>
      <style>body{font-family:-apple-system,"PingFang SC",sans-serif;max-width:720px;margin:40px auto;padding:20px;line-height:1.8;color:#1d1d1f;}
      h1{font-size:24px;border-bottom:2px solid #eee;padding-bottom:8px;}h2{font-size:20px;}h3{font-size:16px;}
      table{border-collapse:collapse;width:100%;margin:12px 0;}td,th{border:1px solid #ddd;padding:8px;}th{background:#f5f5f7;}
      code{background:#f5f5f7;padding:2px 6px;border-radius:4px;}pre{background:#f5f5f7;padding:16px;border-radius:8px;}
      blockquote{border-left:3px solid #5786FE;padding-left:16px;color:#666;}
      @media print{body{margin:0;max-width:none;}}</style></head><body>${html}
      <script>window.onload=()=>setTimeout(()=>window.print(),500);</script></body></html>`);
    printWin.document.close();
    return;
  }
  const res = await fetch(`/api/notes/${id}/export/docx`, { headers: { Authorization: `Bearer ${getToken()}` } });
  if (!res.ok) return;
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = `${id}.docx`; a.click();
  URL.revokeObjectURL(url);
}

export function NotesScreen() {
  const toast = useToast();
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [notes, setNotes] = useState<any[]>([]);
  const [loadingList, setLoadingList] = useState(false);

  // 加载已有笔记列表（kind=note）
  const loadNotes = async () => {
    setLoadingList(true);
    try {
      const r = await api.listDocs();
      setNotes((r.documents || []).filter((d: any) => d.kind === "note"));
    } catch { /* ignore */ }
    finally { setLoadingList(false); }
  };
  useEffect(() => { loadNotes(); }, [msg]);

  const reset = () => { setTitle(""); setContent(""); setEditId(null); setMsg(""); setErr(""); };

  const save = async () => {
    setErr(""); setMsg(""); setSaving(true);
    if (!title.trim() || !content.trim()) {
      setErr("标题和正文都不能为空"); setSaving(false); return;
    }
    try {
      if (editId) {
        await api.updateNote(editId, title, content);
        setMsg("笔记已更新，正在重新摄入…");
        toast("success", "笔记已更新");
      } else {
        await api.createNote(title, content);
        setMsg("已保存，正在摄入知识库…");
        toast("success", "笔记已保存");
      }
      reset();
    } catch (e) {
      setErr((e as Error).message);
      toast("error", "保存失败");
    } finally { setSaving(false); }
  };

  const editNote = async (id: string) => {
    try {
      const r = await api.getDoc(id);
      setEditId(id);
      setTitle(r.document.title);
      setContent(r.document.contentMd || "");
      setMsg(""); setErr("");
    } catch { toast("error", "加载失败"); }
  };

  const del = async (id: string) => {
    if (!confirm("删除此笔记？")) return;
    try {
      await api.deleteDoc(id);
      toast("success", "已删除");
      if (editId === id) reset();
      loadNotes();
    } catch (e) {
      toast("error", `删除失败：${(e as Error).message}`);
    }
  };

  return (
    <div className="panel">
      <div className="panel-inner">
        <h1>{editId ? "编辑笔记" : "写笔记"}</h1>
        <div className="panel-sub">{editId ? "修改后自动重新摄入知识库。" : "写下的笔记会自动入库，可在问答中被检索引用。支持 Markdown。"}</div>

        <div className="card">
          <div className="field">
            <label>标题</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="笔记标题" />
          </div>
          <div className="field">
            <label>正文</label>
            <textarea
              rows={18}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder={"支持 Markdown 语法…\n\n# 标题\n\n正文内容…"}
            />
          </div>

          {err && <div className="msg-error" style={{ marginBottom: 12 }}>{err}</div>}
          {msg && <div className="msg-ok" style={{ marginBottom: 12 }}>{msg}</div>}

          <div className="row" style={{ gap: 8 }}>
            <button className="btn" onClick={save} disabled={saving}>
              {saving ? "保存中…" : editId ? "更新并重新摄入" : "保存并摄入"}
            </button>
            {editId && <button className="btn-secondary" onClick={reset}>取消编辑</button>}
          </div>
        </div>

        <h2 style={{ fontSize: 16, marginTop: 24, marginBottom: 12 }}>已有笔记</h2>
        {loadingList && <div className="muted">加载中…</div>}
        {notes.map((n) => (
          <div key={n.id} className="doc-row">
            <div className="doc-icon"><IconNote size={18} /></div>
            <div className="doc-meta">
              <div className="doc-title">{n.title}</div>
              <div className="doc-sub">{new Date(n.createdAt).toLocaleString()}</div>
            </div>
            <span className={`badge ${n.status}`}>{n.status === "ready" ? "就绪" : "处理中"}</span>
            <button className="note-export-btn" onClick={() => exportNote(n.id, "pdf")} title="导出 PDF">PDF</button>
            <button className="note-export-btn" onClick={() => exportNote(n.id, "docx")} title="导出 Word">Word</button>
            <button className="btn-secondary" style={{ padding: "6px 10px" }} onClick={() => editNote(n.id)}><IconEdit size={14} /></button>
            <button className="btn-danger" style={{ padding: "6px 10px" }} onClick={() => del(n.id)}><IconTrash size={14} /></button>
          </div>
        ))}
        {!loadingList && notes.length === 0 && (
          <div className="muted" style={{ textAlign: "center", padding: 24 }}>还没有笔记</div>
        )}
      </div>
    </div>
  );
}
