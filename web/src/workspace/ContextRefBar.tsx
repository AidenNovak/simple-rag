import { createPortal } from "react-dom";
import { useLayoutEffect, useRef, useState } from "react";
import { IconNote } from "../Icons.js";
import type { RefNote } from "./ReferenceNotePicker.js";

interface Props {
  selectedIds: string[];
  titles: Record<string, string>;
  notes: RefNote[];
  onToggle: (id: string, title: string) => void;
  onClear: () => void;
}

/** composer 上方常驻参考条：「参考：N 篇 / 标题 ▾」+ portal 多选切换 + × 清除。 */
export function ContextRefBar({ selectedIds, titles, notes, onToggle, onClear }: Props) {
  const anchorRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0, width: 280 });

  useLayoutEffect(() => {
    if (!open || !anchorRef.current) return;
    const r = anchorRef.current.getBoundingClientRect();
    setPos({ top: r.bottom + 4, left: r.left, width: Math.max(260, r.width) });
  }, [open]);

  useLayoutEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, [open]);

  const label = selectedIds.length === 1
    ? `参考：${titles[selectedIds[0]] ?? ""}`
    : `参考：${selectedIds.length} 篇`;

  return (
    <div ref={anchorRef} className="ws-context-ref-bar" data-testid="context-ref-bar">
      <IconNote size={12} />
      <span className="ws-context-ref-label">{label}</span>
      <button
        type="button"
        className="ws-context-ref-change"
        aria-label="更换参考笔记"
        onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
      >
        ▾
      </button>
      <button type="button" className="ws-context-clear" aria-label="清除参考笔记" onClick={onClear}>×</button>
      {open && createPortal(
        <div
          className="ws-ref-portal model-dropdown"
          style={{ position: "fixed", top: pos.top, left: pos.left, minWidth: pos.width, zIndex: 5000 }}
          onClick={(e) => e.stopPropagation()}
        >
          <div style={{ padding: "8px 12px", fontSize: 12, color: "var(--text-muted)" }}>参考笔记（可多选）</div>
          {notes.map((n) => {
            const checked = selectedIds.includes(n.id);
            return (
              <button
                key={n.id}
                type="button"
                className={`scope-item${checked ? " active" : ""}`}
                style={{ display: "flex", width: "100%", textAlign: "left" }}
                onClick={() => onToggle(n.id, n.title)}
              >
                {checked ? "☑ " : "☐ "}{n.title}
              </button>
            );
          })}
        </div>,
        document.body
      )}
    </div>
  );
}
