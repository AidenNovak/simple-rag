import { useEffect, useRef } from "react";
import { useDebouncedSave } from "./useDebouncedSave.js";

interface Props {
  open: boolean;
  content: string;
  onChange: (v: string) => void;
  onClose: () => void;
  onSave: (v: string) => Promise<void>;
}

/** 40% 宽 Side Peek 源码编辑层：Esc 关闭，停输 800ms 自动保存。 */
export function SourcePeek({ open, content, onChange, onClose, onSave }: Props) {
  const taRef = useRef<HTMLTextAreaElement>(null);
  const status = useDebouncedSave(open ? content : "", onSave, 800);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    taRef.current?.focus();
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <aside className="ws-source-peek" data-testid="source-peek" aria-label="源码编辑">
      <div className="ws-peek-head">
        <span>源码</span>
        <span className="ws-save-pill" data-status={status}>
          {status === "saving" ? "保存中" : status === "pending" ? "未保存" : "已保存"}
        </span>
        <button type="button" className="ws-peek-close" aria-label="关闭" onClick={onClose}>×</button>
      </div>
      <textarea
        ref={taRef}
        className="ws-peek-textarea"
        aria-label="Markdown 源码"
        value={content}
        onChange={(e) => onChange(e.target.value)}
        spellCheck={false}
      />
    </aside>
  );
}
