import { useRef, useState, useEffect, useCallback } from "react";
import { useToast } from "./Toast.js";
import { IconNote, IconFile, IconSave } from "../Icons.js";

export type SaveStatus = "idle" | "saving" | "saved" | "error";

interface Props {
  docId: string | null;
  title: string;
  content: string;
  kind?: "note" | "file";
  dirty: boolean;
  saving: boolean;
  saveStatus: SaveStatus;
  onTitleChange: (t: string) => void;
  onContentChange: (c: string) => void;
  onSave: () => void;
  /** 选区变化回调（工作台据此注入对话上下文）。 */
  onSelectionChange?: (sel: string | null) => void;
}

/**
 * 中间编辑器栏：标题 + 正文 textarea + 自动保存状态 + 选区浮窗。
 * - textarea 的 onSelect 提取选区文本，回传工作台
 * - 浮窗"💬 加入对话"由父组件渲染（onSelectionChange 触发）；此处只负责上报选区
 */
export function NoteEditor({
  docId, title, content, kind = "note",
  dirty, saving, saveStatus,
  onTitleChange, onContentChange, onSave, onSelectionChange,
}: Props) {
  const taRef = useRef<HTMLTextAreaElement>(null);
  const [selPopup, setSelPopup] = useState<{ x: number; y: number; text: string } | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 提取选区
  const handleSelect = useCallback(() => {
    const ta = taRef.current;
    if (!ta) return;
    const { selectionStart, selectionEnd } = ta;
    const sel = selectionStart !== selectionEnd ? content.slice(selectionStart, selectionEnd) : "";
    if (sel.trim().length > 0) {
      const rect = ta.getBoundingClientRect();
      // 粗略定位浮窗到选区上方（textarea 内无法精确取光标坐标，用底部居中兜底）
      setSelPopup({ x: rect.left + rect.width / 2, y: rect.bottom - 30, text: sel });
      onSelectionChange?.(sel);
    } else {
      setSelPopup(null);
      onSelectionChange?.(null);
    }
  }, [content, onSelectionChange]);

  // Cmd/Ctrl+S 手动保存
  const onKeyDown = (e: React.KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
      e.preventDefault();
      onSave();
    }
  };

  // 调试：字数
  const charCount = content.length;

  if (!docId) {
    return (
      <div className="ws-editor ws-empty">
        <div className="ws-empty-hint">
          <IconNote size={40} />
          <h2>工作台</h2>
          <p>从左侧打开或新建一篇笔记开始编辑</p>
          <p className="muted" style={{ fontSize: 13, marginTop: 8 }}>
            编辑后自动保存 · 选中文字可带入对话 · 在右侧与 AI 讨论
          </p>
        </div>
      </div>
    );
  }

  const isFile = kind === "file";

  return (
    <div className="ws-editor">
      <div className="ws-editor-toolbar">
        <div className="row" style={{ gap: 8, flex: 1, minWidth: 0 }}>
          {isFile ? <IconFile size={15} /> : <IconNote size={15} />}
          <input
            className="ws-title-input"
            value={title}
            onChange={(e) => onTitleChange(e.target.value)}
            disabled={isFile}
            placeholder="笔记标题"
          />
        </div>
        <div className="row" style={{ gap: 10, flexShrink: 0 }}>
          <span className="muted" style={{ fontSize: 12 }}>{charCount} 字</span>
          {dirty && <span className="ws-dirty-dot" title="有未保存修改" />}
          <span className={`ws-save-status ${saveStatus}`}>
            {saveStatus === "saving" ? "保存中…" : saveStatus === "saved" ? "✓ 已保存" : saveStatus === "error" ? "⚠ 保存失败" : ""}
          </span>
          {!isFile && (
            <button className="btn" onClick={onSave} disabled={saving || (!dirty && saveStatus === "saved")} title="保存（Ctrl/Cmd+S）">
              <IconSave size={14} /> 保存
            </button>
          )}
        </div>
      </div>

      <textarea
        ref={taRef}
        className="ws-textarea"
        value={content}
        onChange={(e) => onContentChange(e.target.value)}
        onSelect={handleSelect}
        onKeyDown={onKeyDown}
        readOnly={isFile}
        placeholder="支持 Markdown…"
        spellCheck={false}
      />

      {selPopup && (
        <div
          className="selection-popover"
          style={{ left: selPopup.x, top: selPopup.y }}
          onMouseDown={(e) => e.preventDefault()}
        >
          <span>已选中 {selPopup.text.length} 字</span>
          <span className="muted" style={{ fontSize: 11 }}>已带入右侧对话</span>
        </div>
      )}
    </div>
  );
}
