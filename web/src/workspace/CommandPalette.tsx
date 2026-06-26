import { useEffect, useState, useRef } from "react";
import { api } from "../api.js";
import { useWorkspace } from "./WorkspaceStore.js";
import { useToast } from "../components/Toast.js";
import { IconSearch } from "../Icons.js";

interface SearchResult { docId?: string; docTitle: string; text: string; }

/** ⌘K / Ctrl+K 唤起的全局搜索面板：debounce 调 /api/search，Enter/点击打开文档。 */
export function CommandPalette() {
  const { dispatch } = useWorkspace();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 全局快捷键 ⌘K / Ctrl+K
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 30);
    else { setQ(""); setResults([]); }
  }, [open]);

  // debounce 300ms 搜索
  useEffect(() => {
    if (!q.trim()) { setResults([]); return; }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const r = await api.search(q, 8);
        setResults((r.results || []).map((x: any) => ({ docId: x.docId, docTitle: x.docTitle, text: x.text })));
      } catch { /* ignore */ } finally { setLoading(false); }
    }, 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [q]);

  const openDoc = async (docId?: string) => {
    if (!docId) return;
    try {
      const r = await api.getDoc(docId);
      const doc = r.document;
      dispatch({ type: "SET_ACTIVE_DOC", payload: { id: doc.id, title: doc.title, content: doc.contentMd || "", kind: doc.kind === "note" ? "note" : "upload" } });
    } catch { toast("error", "打开失败"); }
    setOpen(false);
  };

  if (!open) return null;

  return (
    <div className="cmdk-overlay" onClick={() => setOpen(false)}>
      <div className="cmdk-panel" onClick={(e) => e.stopPropagation()}>
        <div className="cmdk-input-wrap">
          <IconSearch size={16} />
          <input
            ref={inputRef}
            className="cmdk-input"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && results[0]) openDoc(results[0].docId);
              if (e.key === "Escape") setOpen(false);
            }}
            placeholder="搜索知识库（⌘K）…"
          />
        </div>
        <div className="cmdk-results">
          {loading && <div className="muted cmdk-hint">搜索中…</div>}
          {!loading && q.trim() && results.length === 0 && <div className="muted cmdk-hint">无匹配结果</div>}
          {!loading && results.map((r, i) => (
            <button key={i} className="cmdk-row" onClick={() => openDoc(r.docId)}>
              <div className="cmdk-title">{r.docTitle}</div>
              <div className="cmdk-snippet">{(r.text || "").slice(0, 100)}</div>
            </button>
          ))}
          {!q.trim() && <div className="muted cmdk-hint">输入关键词搜索你的笔记与文档</div>}
        </div>
      </div>
    </div>
  );
}
