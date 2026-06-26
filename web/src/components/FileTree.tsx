import { useRef } from "react";
import { IconNote, IconFile, IconPlus, IconTrash, IconUpload } from "../Icons.js";

export interface TreeNode {
  id: string;
  title: string;
  kind: "note" | "file";
  sourceFormat?: string | null;
  status: string;
  createdAt: string;
}

interface Props {
  notes: TreeNode[];
  files: TreeNode[];
  activeId: string | null;
  onOpen: (node: TreeNode) => void;
  onNewNote: () => void;
  onDelete: (node: TreeNode) => void;
  onUpload: (file: File) => void;
}

/** 左侧文件树：笔记与文件分组，新建/打开/删除/上传。 */
export function FileTree({ notes, files, activeId, onOpen, onNewNote, onDelete, onUpload }: Props) {
  const fileInput = useRef<HTMLInputElement>(null);

  const renderRow = (n: TreeNode) => (
    <div
      key={n.id}
      className={`tree-row ${activeId === n.id ? "active" : ""}`}
      onClick={() => onOpen(n)}
      title={n.title}
    >
      <span className="tree-icon">{n.kind === "note" ? <IconNote size={14} /> : <IconFile size={14} />}</span>
      <span className="tree-label">{n.title}</span>
      {n.status !== "ready" && <span className="tree-status">{n.status === "failed" ? "⚠" : "⏳"}</span>}
      <button
        className="tree-del"
        title="删除"
        onClick={(e) => { e.stopPropagation(); onDelete(n); }}
      >
        <IconTrash size={12} />
      </button>
    </div>
  );

  return (
    <div className="ws-tree">
      <div className="ws-tree-actions">
        <button className="btn" onClick={onNewNote} style={{ flex: 1 }}>
          <IconPlus size={14} /> 新建笔记
        </button>
        <button className="btn-secondary" onClick={() => fileInput.current?.click()} title="上传文件">
          <IconUpload size={14} />
        </button>
        <input
          ref={fileInput}
          type="file"
          style={{ display: "none" }}
          accept=".pdf,.docx,.doc,.pptx,.xlsx,.xls,.csv,.md,.markdown,.txt,.html,.htm,.epub"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onUpload(f);
            e.target.value = "";
          }}
        />
      </div>

      {notes.length > 0 && (
        <div className="tree-group">
          <div className="tree-group-label">📝 笔记 ({notes.length})</div>
          {notes.map(renderRow)}
        </div>
      )}

      {files.length > 0 && (
        <div className="tree-group">
          <div className="tree-group-label">📄 文件 ({files.length})</div>
          {files.map(renderRow)}
        </div>
      )}

      {notes.length === 0 && files.length === 0 && (
        <div className="muted" style={{ padding: 24, textAlign: "center", fontSize: 13 }}>
          知识库为空<br />新建笔记或上传文件开始
        </div>
      )}
    </div>
  );
}
