export interface RefNote { id: string; title: string; }

interface Props {
  notes: RefNote[];
  selectedId: string | null;
  onSelect: (id: string, title: string) => void;
}

/** 空态参考笔记单选列表：用户无需打开中栏即可选择 AI 参考哪篇笔记。 */
export function ReferenceNotePicker({ notes, selectedId, onSelect }: Props) {
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
      <ul className="ws-ref-picker-list" role="listbox" aria-label="参考笔记">
        {notes.map((n) => {
          const active = selectedId === n.id;
          return (
            <li key={n.id} role="option" aria-selected={active}>
              <button
                type="button"
                className={`ws-ref-picker-row${active ? " active" : ""}`}
                onClick={() => onSelect(n.id, n.title)}
              >
                <span className="ws-ref-picker-dot" aria-hidden>{active ? "●" : "○"}</span>
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
