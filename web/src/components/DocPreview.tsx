import { useEffect, useState } from "react";
import { api, getToken } from "../api.js";
import { IconClose, IconCopy, IconCheck, IconDownload } from "../Icons.js";
import MarkdownRender from "markstream-react";
import "katex/dist/katex.min.css";

function normalizeMath(text: string): string {
  return text
    .replace(/\\\[([\s\S]*?)\\\]/g, (_, m) => `$$${m}$$`)
    .replace(/\\\(([\s\S]*?)\\\)/g, (_, m) => `$${m}$`);
}

/** 下载原始文件 */
async function downloadOriginal(docId: string, filename: string) {
  const res = await fetch(`/api/documents/${docId}/download`, { headers: { Authorization: `Bearer ${getToken()}` } });
  if (!res.ok) return;
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

/** 文档预览弹窗：笔记→Markdown 渲染；上传文件→提取文本渲染 + 下载原件。 */
export function DocPreview({ docId, onClose }: { docId: string | null; onClose: () => void }) {
  const [doc, setDoc] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!docId) { setDoc(null); setError(false); return; }
    setLoading(true); setError(false);
    api.getDoc(docId).then((r) => setDoc(r.document)).catch(() => setError(true)).finally(() => setLoading(false));
  }, [docId]);

  useEffect(() => {
    if (!docId) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [docId, onClose]);

  if (!docId) return null;

  const isFile = doc?.kind === "file";
  const rawContent = doc?.contentMd || doc?.meta?.extractedText || "（无文本内容）";

  const copyContent = async () => {
    try {
      await navigator.clipboard.writeText(rawContent);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* ignore */ }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="row" style={{ gap: 10, flex: 1, minWidth: 0 }}>
            <strong style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{doc?.title || "加载中…"}</strong>
            {doc?.sourceFormat && <span className="badge" style={{ background: "var(--bg-main)", color: "var(--text-muted)", flexShrink: 0 }}>{doc.sourceFormat.toUpperCase()}</span>}
          </div>
          <div className="row" style={{ gap: 6, flexShrink: 0 }}>
            <button className="note-export-btn" onClick={copyContent} title="复制全文">
              {copied ? <IconCheck size={13} /> : <IconCopy size={13} />} {copied ? "已复制" : "复制"}
            </button>
            {isFile && doc?.filePath && (
              <button className="note-export-btn" onClick={() => downloadOriginal(doc.id, doc.title)} title="下载原始文件">
                <IconDownload size={13} /> 原件
              </button>
            )}
            <button className="icon-btn" onClick={onClose}><IconClose size={18} /></button>
          </div>
        </div>
        <div className="modal-body">
          {loading && <div className="muted" style={{ textAlign: "center", padding: 40 }}>加载中…</div>}
          {error && <div className="msg-error" style={{ textAlign: "center", padding: 40 }}>加载失败</div>}
          {!loading && !error && doc && (
            <>
              {isFile && (
                <div style={{ marginBottom: 12, padding: "8px 12px", background: "var(--bg-elevated)", borderRadius: 8, fontSize: 13, color: "var(--text-secondary)" }}>
                  📎 从 {doc.sourceFormat?.toUpperCase()} 提取的文本内容：
                </div>
              )}
              <div className="doc-preview-rendered">
                <MarkdownRender content={normalizeMath(rawContent)} final={true} fade={false} />
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
