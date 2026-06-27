import { useCallback, useRef, type ReactNode } from "react";
import { useWorkspace } from "../WorkspaceStore.js";
import { FileTree } from "../FileTree.js";
import { EditorPane } from "../EditorPane.js";
import { ChatPane } from "../ChatPane.js";
import "../layout.css";

interface Props {
  chatModel?: string | null;
  topbar?: ReactNode;
}

/** Grid 唯一 owner：5 列 + grid-template-areas，resizer 占独立列，pane 用 data-pane 绑定。
 *  拖拽 resizer 调整左右栏宽（持久化到 localStorage）。 */
export function WorkspaceLayout({ chatModel, topbar }: Props) {
  const { state, dispatch } = useWorkspace();
  const dragRef = useRef<"left" | "right" | null>(null);

  const onMouseMove = useCallback((e: MouseEvent) => {
    if (dragRef.current === "left") {
      dispatch({ type: "SET_LAYOUT", payload: { leftWidth: Math.max(180, Math.min(400, e.clientX)) } });
    }
    if (dragRef.current === "right") {
      dispatch({ type: "SET_LAYOUT", payload: { rightWidth: Math.max(300, Math.min(560, window.innerWidth - e.clientX)) } });
    }
  }, [dispatch]);

  const onMouseUp = useCallback(() => {
    dragRef.current = null;
    document.removeEventListener("mousemove", onMouseMove);
    document.removeEventListener("mouseup", onMouseUp);
  }, [onMouseMove]);

  const startDrag = (side: "left" | "right") => (e: React.MouseEvent) => {
    e.preventDefault();
    dragRef.current = side;
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  };

  const style = {
    ["--ws-left" as string]: `${state.layout.leftWidth}px`,
    ["--ws-right" as string]: `${state.layout.rightWidth}px`,
  } as React.CSSProperties;

  return (
    <div className="workspace-root" style={style}>
      <header className="workspace-topbar" role="banner">{topbar}</header>
      <aside className="workspace-left" data-pane="left" data-testid="file-tree-pane">
        <FileTree />
      </aside>
      <div className="workspace-resizer-left" role="separator" aria-orientation="vertical" onMouseDown={startDrag("left")} />
      <main className="workspace-center" data-pane="center" data-testid="editor-pane">
        <EditorPane />
      </main>
      <div className="workspace-resizer-right" role="separator" aria-orientation="vertical" onMouseDown={startDrag("right")} />
      <aside className="workspace-right" data-pane="right" data-testid="chat-pane">
        <ChatPane chatModel={chatModel} />
      </aside>
    </div>
  );
}
