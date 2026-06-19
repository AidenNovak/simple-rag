import { useEffect, useState, useCallback } from "react";
import { api } from "../api.js";
import { fileIcon, IconUpload, IconTrash, IconEye } from "../Icons.js";
import { useToast } from "../components/Toast.js";
import { DocPreview } from "../components/DocPreview.js";

const STATUS_LABEL: Record<string, string> = {
  pending: "排队中", extracting: "解析中", ocr: "OCR 中",
  chunking: "切分中", embedding: "向量化中", ready: "就绪", failed: "失败",
};

export function DocumentsScreen() {
  const toast = useToast();
  const [docs, setDocs] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [drag, setDrag] = useState(false);
  const [err, setErr] = useState("");
  const [previewDoc, setPreviewDoc] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.listDocs();
      setDocs(r.documents);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    const t = setInterval(() => {
      if (docs.some((d) => ["pending", "extracting", "chunking", "embedding", "ocr"].includes(d.status))) {
        refresh();
      }
    }, 3000);
    return () => clearInterval(t);
  }, [refresh, docs]);

  const upload = async (file: File) => {
    setErr("");
    try {
      await api.upload(file);
      toast("success", `已上传 ${file.name}`);
      await refresh();
    } catch (e) {
      setErr((e as Error).message);
      toast("error", `上传失败：${(e as Error).message}`);
    }
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDrag(false);
    Array.from(e.dataTransfer.files).forEach(upload);
  };

  const pick = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.multiple = true;
    input.accept = ".pdf,.docx,.pptx,.xlsx,.csv,.md,.txt,.html,.epub";
    input.onchange = () => Array.from(input.files || []).forEach(upload);
    input.click();
  };

  const reingest = async (id: string) => {
    try {
      await api.reingest(id);
      toast("success", "已重新加入摄入队列");
      await refresh();
    } catch (e) {
      toast("error", `重试失败：${(e as Error).message}`);
    }
  };

  const del = async (id: string) => {
    if (!confirm("删除该文档？相关内容将从知识库移除。")) return;
    try {
      await api.deleteDoc(id);
      toast("success", "已删除");
      await refresh();
    } catch (e) {
      toast("error", `删除失败：${(e as Error).message}`);
    }
  };

  const fmtSize = (b: number) => (b > 1e6 ? `${(b / 1e6).toFixed(1)} MB` : `${(b / 1e3).toFixed(0)} KB`);

  return (
    <div className="panel">
      <div className="panel-inner">
        <h1>知识库</h1>
        <div className="panel-sub">上传文档自动解析入库，支持 PDF / Word / PPTX / XLSX / Markdown / HTML / EPUB。扫描件自动走 OCR。</div>

        <div
          className={`dropzone ${drag ? "drag" : ""}`}
          onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
          onDragLeave={() => setDrag(false)}
          onDrop={onDrop}
          onClick={pick}
        >
          <IconUpload size={32} />
          <div>拖拽文件到此处，或点击选择</div>
          <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>单文件上限 50 MB</div>
        </div>

        {err && <div className="msg-error" style={{ marginBottom: 12 }}>{err}</div>}

        {loading && docs.length === 0 && <div className="muted">加载中…</div>}

        {docs.map((d) => (
          <div key={d.id} className="doc-row">
            <div className="doc-icon">{fileIcon(d.sourceFormat)}</div>
            <div className="doc-meta">
              <div className="doc-title">{d.title}</div>
              <div className="doc-sub">
                {(d.sourceFormat || "").toUpperCase()}
                {d.sizeBytes ? ` · ${fmtSize(d.sizeBytes)}` : ""}
                {d.kind === "note" ? " · 笔记" : ""}
                {" · "}{new Date(d.createdAt).toLocaleDateString()}
                {d.errorMsg && <span style={{ color: "var(--danger)" }}> · {d.errorMsg}</span>}
              </div>
            </div>
            <span className={`badge ${d.status}`}>{STATUS_LABEL[d.status] || d.status}</span>
            {d.status === "failed" && (
              <button className="btn-secondary" style={{ padding: "6px 12px", fontSize: 13 }} onClick={() => reingest(d.id)} title="重新摄入">
                <span className="row" style={{ gap: 5 }}>🔄 重试</span>
              </button>
            )}
            {d.status === "ready" && (
              <button className="btn-secondary" style={{ padding: "6px 12px", fontSize: 13 }} onClick={() => setPreviewDoc(d.id)} title="预览">
                <IconEye size={14} />
              </button>
            )}
            <button className="btn-danger" style={{ padding: "6px 12px", fontSize: 13 }} onClick={() => del(d.id)}>
              <span className="row" style={{ gap: 5 }}><IconTrash size={14} />删除</span>
            </button>
          </div>
        ))}

        {!loading && docs.length === 0 && (
          <div className="muted" style={{ textAlign: "center", padding: 32 }}>还没有文档，上传一个开始吧。</div>
        )}
      </div>

      <DocPreview docId={previewDoc} onClose={() => setPreviewDoc(null)} />
    </div>
  );
}
