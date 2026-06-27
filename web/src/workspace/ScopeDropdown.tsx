import { createPortal } from "react-dom";
import { useLayoutEffect, useState } from "react";
import { IconLibrary } from "../Icons.js";

interface Doc { id: string; title: string; }

interface Props {
  anchorRef: React.RefObject<HTMLElement>;
  open: boolean;
  onToggle: () => void;
  docs: Doc[];
  scopeDocIds: string[] | null;
  onToggleDoc: (id: string) => void;
  onSelectAll: () => void;
}

/** Scope 多选下拉：菜单用 createPortal 挂到 body，position:fixed 定位到锚点下方，
 *  避免被右栏 overflow:hidden 裁剪（EV3）。 */
export function ScopeDropdown({ anchorRef, open, onToggle, docs, scopeDocIds, onToggleDoc, onSelectAll }: Props) {
  const [pos, setPos] = useState({ top: 0, left: 0, width: 260 });

  useLayoutEffect(() => {
    if (!open || !anchorRef.current) return;
    const r = anchorRef.current.getBoundingClientRect();
    setPos({ top: r.bottom + 4, left: r.left, width: Math.max(240, r.width) });
  }, [open, anchorRef]);

  return (
    <div ref={anchorRef as React.RefObject<HTMLDivElement>} className="model-switcher">
      <button type="button" className="scope-badge" onClick={onToggle}>
        <IconLibrary size={13} />
        {scopeDocIds === null ? "全部文档" : `${scopeDocIds.length} 篇`}
        <span style={{ fontSize: 10, opacity: 0.6 }}>▼</span>
      </button>
      {open && createPortal(
        <div
          className="ws-scope-portal model-dropdown"
          style={{ position: "fixed", top: pos.top, left: pos.left, minWidth: pos.width, zIndex: 5000 }}
          onClick={(e) => e.stopPropagation()}
        >
          <div style={{ padding: "8px 12px", fontSize: 12, color: "var(--text-muted)" }}>选择本会话检索的文档</div>
          {docs.map((d) => {
            const checked = scopeDocIds === null || scopeDocIds.includes(d.id);
            return (
              <label key={d.id} className="scope-item" onClick={(e) => { e.stopPropagation(); onToggleDoc(d.id); }}>
                <input type="checkbox" checked={checked} readOnly />
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.title}</span>
              </label>
            );
          })}
          <div className="scope-actions">
            <button type="button" className="btn-secondary" style={{ fontSize: 12, padding: "4px 10px" }} onClick={onSelectAll}>全选</button>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
