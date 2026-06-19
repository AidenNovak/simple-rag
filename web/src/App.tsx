import { useEffect, useState, useCallback } from "react";
import { api, getToken, setToken, clearToken } from "./api.js";
import { IconChat, IconLibrary, IconNote, IconSearch, IconSettings, IconPlus, IconBook, IconMenu, IconDeepSeek, IconTrash, IconEdit } from "./Icons.js";
import { useToast } from "./components/Toast.js";
import { AuthScreen } from "./screens/Auth.js";
import { ChatView } from "./screens/Chat.js";
import { DocumentsScreen } from "./screens/Documents.js";
import { NotesScreen } from "./screens/Notes.js";
import { SearchScreen } from "./screens/Search.js";
import { SettingsScreen } from "./screens/Settings.js";

type View = "chat" | "documents" | "notes" | "search" | "settings";

interface Convo { id: string; title: string; }

export default function App() {
  const toast = useToast();
  const [authed, setAuthed] = useState(!!getToken());
  const [user, setUser] = useState<any>(null);
  const [view, setView] = useState<View>("chat");
  const [convos, setConvos] = useState<Convo[]>([]);
  const [activeConvo, setActiveConvo] = useState<string | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [editingConvo, setEditingConvo] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");

  const loadConvos = useCallback(async () => {
    try {
      const r = await api.listConversations();
      setConvos(r.conversations || []);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    if (!authed) return;
    api.me().then((r) => setUser(r.user)).catch(() => {
      clearToken(); setAuthed(false);
    });
    loadConvos();
    const onLogout = () => setAuthed(false);
    const onNav = (e: Event) => { const v = (e as CustomEvent).detail as View; if (v) setView(v); };
    window.addEventListener("auth:logout", onLogout);
    window.addEventListener("nav", onNav as EventListener);
    return () => {
      window.removeEventListener("auth:logout", onLogout);
      window.removeEventListener("nav", onNav as EventListener);
    };
  }, [authed, loadConvos]);

  if (!authed) {
    return (
      <AuthScreen onDone={(token, u) => {
        setToken(token); setUser(u); setAuthed(true);
      }} />
    );
  }

  const goChat = () => { setView("chat"); setMobileOpen(false); };
  const newChat = () => { setActiveConvo(null); setView("chat"); setMobileOpen(false); };
  const openConvo = (id: string) => { setActiveConvo(id); setView("chat"); setMobileOpen(false); };
  const nav = (v: View) => { setView(v); setMobileOpen(false); };

  const renameConvo = async (id: string) => {
    if (!editTitle.trim()) { setEditingConvo(null); return; }
    try {
      await api.renameConversation(id, editTitle.trim());
      setConvos((cs) => cs.map((c) => (c.id === id ? { ...c, title: editTitle.trim() } : c)));
      toast("success", "已重命名");
    } catch { toast("error", "重命名失败"); }
    setEditingConvo(null);
  };
  const deleteConvo = async (id: string) => {
    if (!confirm("删除此对话？所有消息将一并删除。")) return;
    try {
      await api.deleteConversation(id);
      setConvos((cs) => cs.filter((c) => c.id !== id));
      if (activeConvo === id) setActiveConvo(null);
      toast("success", "已删除");
    } catch { toast("error", "删除失败"); }
  };

  const navItems: { key: View; label: string; Icon: React.FC<{ size?: number }> }[] = [
    { key: "documents", label: "知识库", Icon: IconLibrary },
    { key: "notes", label: "写笔记", Icon: IconNote },
    { key: "search", label: "检索", Icon: IconSearch },
    { key: "settings", label: "设置", Icon: IconSettings },
  ];

  return (
    <div className={`app ${mobileOpen ? "mobile-open" : ""}`}>
      {/* 侧栏 */}
      <aside className="sidebar">
        <div className="sidebar-top">
          <div className="sidebar-logo">
            <IconBook size={20} />
            <span>私人知识库</span>
          </div>
        </div>

        <button className="new-chat-btn" onClick={newChat}>
          <IconPlus size={18} />
          <span>新对话</span>
        </button>

        <div className="nav-section">
          <button className={`nav-item ${view === "chat" ? "active" : ""}`} onClick={goChat}>
            <IconChat size={18} /><span>对话</span>
          </button>
          {navItems.map((n) => {
            const I = n.Icon;
            return (
              <button
                key={n.key}
                className={`nav-item ${view === n.key ? "active" : ""}`}
                onClick={() => nav(n.key)}
              >
                <I size={18} /><span>{n.label}</span>
              </button>
            );
          })}
        </div>

        <div className="convo-list">
          {convos.length > 0 && (
            <div style={{ padding: "4px 10px", fontSize: 12, color: "var(--text-muted)" }}>最近对话</div>
          )}
          {convos.length === 0 && (
            <div className="muted" style={{ padding: "8px 12px", fontSize: 12 }}>还没有对话，点击「新对话」开始</div>
          )}
          {convos.map((c) => (
            <div
              key={c.id}
              className={`convo-item ${activeConvo === c.id && view === "chat" ? "active" : ""}`}
              onClick={() => openConvo(c.id)}
              title={c.title}
            >
              {editingConvo === c.id ? (
                <input
                  className="convo-rename-input"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  onClick={(e) => e.stopPropagation()}
                  onKeyDown={(e) => { if (e.key === "Enter") renameConvo(c.id); if (e.key === "Escape") setEditingConvo(null); }}
                  onBlur={() => renameConvo(c.id)}
                  autoFocus
                />
              ) : (
                <>
                  <span className="convo-title-text">{c.title}</span>
                  <span className="convo-actions" onClick={(e) => e.stopPropagation()}>
                    <button className="convo-action-btn" title="重命名" onClick={() => { setEditingConvo(c.id); setEditTitle(c.title); }}><IconEdit size={12} /></button>
                    <button className="convo-action-btn" title="删除" onClick={() => deleteConvo(c.id)}><IconTrash size={12} /></button>
                  </span>
                </>
              )}
            </div>
          ))}
        </div>

        <div className="sidebar-bottom">
          <div className="user-pill" onClick={() => nav("settings")}>
            <div className="avatar">{(user?.email || "?")[0].toUpperCase()}</div>
            <div className="email">{user?.email}</div>
          </div>
        </div>
      </aside>

      {/* 主区 */}
      <main className="main">
        {/* 移动端遮罩 */}
        {mobileOpen && <div className="modal-overlay" style={{ zIndex: 90 }} onClick={() => setMobileOpen(false)} />}
        {/* 移动端菜单按钮 */}
        <button className="mobile-menu-btn icon-btn" style={{ position: "absolute", top: 10, left: 10, zIndex: 50 }} onClick={() => setMobileOpen((v) => !v)}>
          <IconMenu size={20} />
        </button>

        {view === "chat" && (
          <ChatView
            activeConvo={activeConvo}
            chatModel={user?.chatModel}
            onConvoCreated={(id, title) => {
              setActiveConvo(id);
              setConvos((cs) => [{ id, title }, ...cs.filter((c) => c.id !== id)]);
            }}
            onModelChange={async (model) => {
              try {
                await api.setModels(model);
                const r = await api.me();
                setUser(r.user);
              } catch { /* ignore */ }
            }}
          />
        )}
        {view === "documents" && <DocumentsScreen />}
        {view === "notes" && <NotesScreen />}
        {view === "search" && <SearchScreen />}
        {view === "settings" && <SettingsScreen user={user} onUpdate={setUser} />}
      </main>
    </div>
  );
}
