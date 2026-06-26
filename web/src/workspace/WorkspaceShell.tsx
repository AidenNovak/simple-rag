import { useCallback, useRef } from "react";
import { useWorkspace } from "./WorkspaceStore.js";
import { FileTree } from "./FileTree.js";
import { EditorPane } from "./EditorPane.js";
import { ChatPane } from "./ChatPane.js";
import { CommandPalette } from "./CommandPalette.js";
import "./layout.css";

interface Props {
  user: { email: string; chatModel?: string | null };
  onOpenSettings: () => void;
}

export function WorkspaceShell({ user, onOpenSettings }: Props) {
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
    <>
      <div className="workspace-mobile-gate">请使用宽度 ≥1280px 的桌面浏览器以获得完整工作区体验。</div>
      <div className="workspace-root" style={style}>
        <header className="workspace-topbar" role="banner">
          <span className="ws-title">私人知识库</span>
          <span className="muted" style={{ marginLeft: "auto", fontSize: 13 }}>{user.email}</span>
          <button type="button" className="btn-secondary" style={{ padding: "4px 12px", fontSize: 13 }} onClick={onOpenSettings}>设置</button>
        </header>
        <aside className="workspace-left"><FileTree /></aside>
        <div className="workspace-resizer" onMouseDown={startDrag("left")} />
        <main className="workspace-center"><EditorPane /></main>
        <div className="workspace-resizer" onMouseDown={startDrag("right")} />
        <aside className="workspace-right"><ChatPane chatModel={user.chatModel} /></aside>
      </div>
      <CommandPalette />
    </>
  );
}
