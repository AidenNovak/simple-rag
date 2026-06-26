import { useWorkspace } from "./WorkspaceStore.js";
import { IconSource } from "../Icons.js";

/**
 * Pick 选区条：编辑器中存在选区时显示（字数 + 加入对话 + 清除）。
 * 选区由 EditorPane 的 onSelect 捕获后 dispatch SET_SELECTION。
 * 「加入对话」仅作显式确认（选区已自动 pin 到下条消息），「×」清除。
 */
export function SelectionContextBar() {
  const { state, dispatch } = useWorkspace();
  if (!state.selection) return null;
  const len = state.selection.text.length;
  return (
    <div className="ws-selection-bar" data-testid="selection-bar">
      <IconSource size={12} />
      <span>已选 {len} 字 · 将作为下条提问上下文</span>
      <button type="button" className="ws-sel-pin" onClick={() => { /* 已 pin，仅提示 */ }}>加入对话</button>
      <button type="button" aria-label="清除选区" className="ws-sel-clear" onClick={() => dispatch({ type: "CLEAR_SELECTION" })}>×</button>
    </div>
  );
}
