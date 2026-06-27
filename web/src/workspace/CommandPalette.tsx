import { useEffect, useState, useRef } from "react";
import { Command } from "cmdk";
import { api } from "../api.js";
import { useWorkspace } from "./WorkspaceStore.js";
import { useToast } from "../components/Toast.js";
import { IconSearch } from "../Icons.js";

interface SearchResult { docId?: string; docTitle: string; text: string; }

/** ⌘K / Ctrl+K 唤起的搜索面板：cmdk 驱动（↑↓ 导航 / Enter 打开 / Esc 关闭），
 *  debounce 调 /api/search 保留。 */
export function CommandPalette() {
  const { dispatch } = useWorkspace();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 全局快捷键 ⌘K / Ctrl+K
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!open) { setQ(""); setResults([]); }
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
      <Command className="cmdk-panel" label="搜索知识库" onClick={(e: any) => e.stopPropagation()} shouldFilter={false}>
        <div className="cmdk-input-wrap">
          <IconSearch size={16} />
          <Command.Input
            className="cmdk-input"
            value={q}
            onValueChange={setQ}
            placeholder="搜索知识库（⌘K）…"
          />
        </div>
        <Command.List className="cmdk-results">
          {loading && <Command.Loading className="muted cmdk-hint">搜索中…</Command.Loading>}
          {!loading && q.trim() && results.length === 0 && <Command.Empty className="muted cmdk-hint">无匹配结果</Command.Empty>}
          {!loading && results.map((r, i) => (
            <Command.Item
              key={r.docId ?? i}
              value={`${r.docTitle} ${r.text}`}
              onSelect={() => openDoc(r.docId)}
              className="cmdk-row"
            >
              <div className="cmdk-title">{r.docTitle}</div>
              <div className="cmdk-snippet">{(r.text || "").slice(0, 100)}</div>
            </Command.Item>
          ))}
          {!q.trim() && <div className="muted cmdk-hint">输入关键词搜索你的笔记与文档</div>}
        </Command.List>
      </Command>
    </div>
  );
}
