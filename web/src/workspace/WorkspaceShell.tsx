import { WorkspaceLayout } from "./layout/WorkspaceLayout.js";
import { CommandPalette } from "./CommandPalette.js";
import { ThemeToggle } from "../theme/ThemeToggle.js";
import "./layout.css";

interface Props {
  user: { email: string; chatModel?: string | null };
  onOpenSettings: () => void;
}

export function WorkspaceShell({ user, onOpenSettings }: Props) {
  return (
    <>
      <div className="workspace-mobile-gate">请使用宽度 ≥1280px 的桌面浏览器以获得完整工作区体验。</div>
      <WorkspaceLayout
        chatModel={user.chatModel}
        topbar={
          <>
            <span style={{ marginLeft: "auto" }} />
            <ThemeToggle />
            <span className="muted text-caption">{user.email}</span>
            <button type="button" className="btn-secondary" style={{ padding: "4px 12px", fontSize: 13 }} onClick={onOpenSettings}>设置</button>
          </>
        }
      />
      <CommandPalette />
    </>
  );
}
