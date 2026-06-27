import { useEffect, useState } from "react";
import { api } from "../api.js";
import MarkdownRender from "markstream-react";
import "markstream-react/index.css";
import "katex/dist/katex.min.css";
import { normalizeMath } from "./craft/normalizeMath.js";
import { IconClose } from "../Icons.js";

/** 文件预览侧滑层（非全屏 modal）：渲染文件文本，Esc 关闭。 */
export function FilePeekPanel({ docId, onClose }: { docId: string | null; onClose: () => void }) {
  const [doc, setDoc] = useState<any>(null);

  useEffect(() => {
    if (!docId) { setDoc(null); return; }
    api.getDoc(docId).then((r) => setDoc(r.document)).catch(() => setDoc(null));
  }, [docId]);

  useEffect(() => {
    if (!docId) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [docId, onClose]);

  if (!docId) return null;

  const raw = doc?.contentMd || doc?.meta?.extractedText || "（无文本内容）";

  return (
    <aside className="ws-file-peek ws-side-peek-panel" data-testid="file-peek">
      <div className="ws-peek-head">
        <strong>{doc?.title || "文件预览"}</strong>
        <button type="button" className="ws-peek-close" aria-label="关闭" onClick={onClose}><IconClose size={14} /></button>
      </div>
      <div className="ws-file-peek-body markstream-react">
        <MarkdownRender content={normalizeMath(raw)} final={true} fade={false} dark />
      </div>
    </aside>
  );
}
