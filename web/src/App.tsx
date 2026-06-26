import { useEffect, useState } from "react";
import { api, getToken, setToken, clearToken } from "./api.js";
import { AuthScreen } from "./screens/Auth.js";
import { SettingsScreen } from "./screens/Settings.js";
import { WorkspaceProvider } from "./workspace/WorkspaceStore.js";
import { WorkspaceShell } from "./workspace/WorkspaceShell.js";

type View = "workspace" | "settings";

/**
 * App 根：认证后进入统一工作区（三栏），不再有「对话/知识库/写笔记/检索」分页主导航。
 * settings 作为独立覆盖视图（BYOK 配置），从工作区顶栏「设置」按钮进入。
 */
export default function App() {
  const [authed, setAuthed] = useState(!!getToken());
  const [user, setUser] = useState<any>(null);
  const [view, setView] = useState<View>("workspace");

  useEffect(() => {
    if (!authed) return;
    api.me().then((r) => setUser(r.user)).catch(() => { clearToken(); setAuthed(false); });
    const onLogout = () => setAuthed(false);
    window.addEventListener("auth:logout", onLogout);
    return () => window.removeEventListener("auth:logout", onLogout);
  }, [authed]);

  if (!authed) {
    return <AuthScreen onDone={(token, u) => { setToken(token); setUser(u); setAuthed(true); }} />;
  }

  // user 未就绪（刷新后 me() 解析前）显示加载态，避免 WorkspaceShell 访问 null.email 崩溃
  if (!user) {
    return <div className="ws-loading">加载中…</div>;
  }

  if (view === "settings") {
    return (
      <SettingsScreen
        user={user}
        onUpdate={setUser}
        onBack={() => setView("workspace")}
      />
    );
  }

  return (
    <WorkspaceProvider>
      <WorkspaceShell user={user} onOpenSettings={() => setView("settings")} />
    </WorkspaceProvider>
  );
}
