export interface RefNote { id: string; title: string; }

interface Props {
  notes: RefNote[];
  selectedIds: string[];
  onToggle: (id: string, title: string) => void;
}

/** 空态参考笔记多选列表：勾选后作为 AI 对话上下文（可多选）。 */
export function ReferenceNotePicker({ notes, selectedIds, onToggle }: Props) {
  if (notes.length === 0) {
    return (
      <div className="ws-ref-picker ws-ref-picker-empty" data-testid="ref-note-picker">
        <p className="ws-ref-picker-title">选择参考笔记</p>
        <p className="muted">知识库暂无笔记，请左侧点击「新建笔记」</p>
      </div>
    );
  }

  return (
    <div className="ws-ref-picker" data-testid="ref-note-picker">
      <h2 className="ws-ref-picker-title">选择参考笔记</h2>
      <ul className="ws-ref-picker-list" role="listbox" aria-label="参考笔记" aria-multiselectable="true">
        {notes.map((n) => {
          const checked = selectedIds.includes(n.id);
          return (
            <li key={n.id} role="option" aria-selected={checked}>
              <button
                type="button"
                className={`ws-ref-picker-row${checked ? " active" : ""}`}
                onClick={() => onToggle(n.id, n.title)}
              >
                <span className="ws-ref-picker-dot" aria-hidden>{checked ? "☑" : "☐"}</span>
                <span className="ws-ref-picker-label">{n.title}</span>
              </button>
            </li>
          );
        })}
      </ul>
      <p className="ws-ref-picker-hint muted">选定后在下方输入问题；中栏 Pick 可带入段落</p>
    </div>
  );
}
