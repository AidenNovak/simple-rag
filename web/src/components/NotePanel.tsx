import { useEffect, useRef, useState } from "react";
import MarkdownRender from "markstream-react";
import "katex/dist/katex.min.css";
import { IconClose, IconCopy, IconCheck } from "../Icons.js";
import { getToken } from "../api.js";

function normalizeMath(text: string): string {
  return text
    .replace(/\\\[([\s\S]*?)\\\]/g, (_, m) => `$$${m}$$`)
    .replace(/\\\(([\s\S]*?)\\\)/g, (_, m) => `$${m}$`);
}

interface Props {
  title: string;
  content: string;
  noteId?: string;
  onClose: () => void;
}

/**
 * 可拖拽调整大小的笔记预览面板。
 * - 固定在右侧，可拖拽左边缘改变宽度
 * - 可关闭（×按钮 / Escape）
 * - 内部 Markdown 渲染
 */
/** 导出：DOCX 走后端下载，PDF 走浏览器打印（渲染 HTML，完美支持中文）。 */
async function downloadExport(noteId: string, format: "pdf" | "docx", title?: string, content?: string) {
  if (format === "pdf") {
    // 用 marked 把 Markdown 渲染为 HTML，再打印
    const { marked } = await import("marked");
    const html = marked.parse(content || "");
    const printWin = window.open("", "_blank");
    if (!printWin) return;
    printWin.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>${title || "笔记"}</title>
      <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css">
      <style>
        body{font-family:-apple-system,"PingFang SC","Microsoft YaHei",sans-serif;max-width:720px;margin:40px auto;padding:20px;line-height:1.8;color:#1d1d1f;}
        h1{font-size:24px;border-bottom:2px solid #eee;padding-bottom:8px;}
        h2{font-size:20px;margin-top:24px;}
        h3{font-size:16px;}
        table{border-collapse:collapse;width:100%;margin:12px 0;}
        td,th{border:1px solid #ddd;padding:8px 12px;text-align:left;}
        th{background:#f5f5f7;font-weight:600;}
        code{background:#f5f5f7;padding:2px 6px;border-radius:4px;font-family:"SF Mono",monospace;font-size:0.9em;}
        pre{background:#f5f5f7;padding:16px;border-radius:8px;overflow-x:auto;}
        pre code{background:none;padding:0;}
        blockquote{border-left:3px solid #5786FE;padding-left:16px;color:#666;margin:12px 0;}
        ul,ol{padding-left:24px;}
        @media print{body{margin:0;max-width:none;}}
      </style></head><body>${html}
      <script>window.onload=()=>{setTimeout(()=>{window.print();},500);}</script>
      </body></html>`);
    printWin.document.close();
    return;
  }
  // DOCX: 后端下载
  const res = await fetch(`/api/notes/${noteId}/export/docx`, {
    headers: { Authorization: `Bearer ${getToken()}` },
  });
  if (!res.ok) return;
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = `${title || "note"}.docx`; a.click();
  URL.revokeObjectURL(url);
}

export function NotePanel({ title, content, noteId, onClose }: Props) {
  const [width, setWidth] = useState(420);
  const [dragging, setDragging] = useState(false);
  const [copied, setCopied] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  const copyContent = async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* ignore */ }
  };

  // Escape 关闭
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // 拖拽调整宽度
  useEffect(() => {
    if (!dragging) return;
    const onMove = (e: MouseEvent) => {
      const newWidth = Math.max(300, Math.min(800, window.innerWidth - e.clientX));
      setWidth(newWidth);
    };
    const onUp = () => setDragging(false);
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    return () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [dragging]);

  return (
    <>
      {/* 拖拽手柄 */}
      <div
        className="note-panel-resizer"
        onMouseDown={() => setDragging(true)}
        style={{ right: width - 4 }}
      />
      <div
        ref={panelRef}
        className="note-panel"
        style={{ width }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="note-panel-header">
          <span className="note-panel-title">📝 {title}</span>
          <div className="row" style={{ gap: 6 }}>
            <button className="note-export-btn" onClick={copyContent} title="复制全文 Markdown">
              {copied ? <IconCheck size={13} /> : <IconCopy size={13} />} {copied ? "已复制" : "复制"}
            </button>
            {noteId && (
              <>
                <button className="note-export-btn" onClick={() => downloadExport(noteId, "pdf", title, content)} title="导出 PDF">PDF</button>
                <button className="note-export-btn" onClick={() => downloadExport(noteId, "docx", title, content)} title="导出 Word">Word</button>
              </>
            )}
            <button className="icon-btn" onClick={onClose}><IconClose size={16} /></button>
          </div>
        </div>
        <div className="note-panel-body">
          <MarkdownRender content={normalizeMath(content)} final={true} fade={false} />
        </div>
      </div>
    </>
  );
}
