import { useState } from "react";
import { api } from "../api.js";
import { IconDeepSeek, DEEPSEEK_BLUE } from "../Icons.js";
import { useToast } from "../components/Toast.js";
import { McpTokensCard } from "./McpTokensCard.js";

export function SettingsScreen({ user, onUpdate, onBack }: { user: any; onUpdate: (u: any) => void; onBack?: () => void }) {
  const toast = useToast();
  const [apiKey, setApiKey] = useState("");
  const [baseUrl, setBaseUrl] = useState(user?.chatBaseUrl || "");
  const [chatModel, setChatModel] = useState(user?.chatModel || "deepseek-v4-pro");
  const [embedModel, setEmbedModel] = useState(user?.embeddingModel || "embedding-3");
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [savingKey, setSavingKey] = useState(false);
  const [savingModels, setSavingModels] = useState(false);

  const saveKey = async () => {
    setErr(""); setMsg(""); setSavingKey(true);
    try {
      await api.setChatConfig({
        ...(apiKey.trim() ? { apiKey: apiKey.trim() } : {}),
        ...(baseUrl.trim() !== undefined ? { baseUrl: baseUrl.trim() } : {}),
        chatModel,
      });
      setMsg("配置已保存");
      toast("success", "Chat 配置已保存");
      setApiKey("");
      const r = await api.me();
      onUpdate(r.user);
    } catch (e) {
      setErr((e as Error).message);
      toast("error", "保存失败");
    } finally { setSavingKey(false); }
  };

  const saveModels = async () => {
    setErr(""); setMsg(""); setSavingModels(true);
    try {
      await api.setModels(chatModel, embedModel);
      setMsg("模型偏好已保存");
      toast("success", "模型偏好已保存");
      const r = await api.me();
      onUpdate(r.user);
    } catch (e) {
      setErr((e as Error).message);
    } finally { setSavingModels(false); }
  };

  const logout = () => {
    localStorage.removeItem("kb_token");
    window.dispatchEvent(new Event("auth:logout"));
  };

  return (
    <div className="panel">
      <div className="panel-inner">
        <div className="row-between" style={{ marginBottom: 4 }}>
          <h1 style={{ margin: 0 }}>设置</h1>
          {onBack && <button className="btn-secondary" onClick={onBack}>← 返回工作台</button>}
        </div>
        <div className="panel-sub">配置模型与 API Key。Chat 走 DeepSeek，Embedding 走智谱 embedding-3。</div>

        <div className="card">
          <h2 className="row" style={{ gap: 8 }}>
            <IconDeepSeek size={18} /> DeepSeek Chat
          </h2>
          <div className="card-sub">
            当前对话模型。DeepSeek v4-pro 为推理增强模型，支持知识库工具调用。
          </div>
          <div className="field">
            <label>Chat 模型</label>
            <select value={chatModel} onChange={(e) => setChatModel(e.target.value)} className="field-select">
              <option value="deepseek-v4-pro">deepseek-v4-pro（推理增强，推荐）</option>
              <option value="deepseek-v4-flash">deepseek-v4-flash（快速）</option>
            </select>
          </div>
        </div>

        <div className="card">
          <h2>Bring Your Own Key</h2>
          <div className="card-sub">
            绑定你自己的 Chat API Key 和端点，调用按此计量计费。留空端点则使用系统默认（DeepSeek 官方）。
            {!user?.hasNewapiKey && <span style={{ color: "#d97706" }}> 当前未绑定，调用使用系统默认。</span>}
            {user?.hasNewapiKey && <span style={{ color: "#10a37f" }}> 已绑定 ✓</span>}
          </div>
          <div className="field">
            <label>API Key</label>
            <input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="sk-..." />
          </div>
          <div className="field">
            <label>自定义端点（可选，留空用系统默认）</label>
            <input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="https://api.deepseek.com/v1" />
          </div>
          <div className="field">
            <label>模型名称</label>
            <input value={chatModel} onChange={(e) => setChatModel(e.target.value)} placeholder="deepseek-v4-pro" />
          </div>
          <button className="btn" onClick={saveKey} disabled={(!apiKey.trim() && !baseUrl.trim()) || savingKey}>
            {savingKey ? "保存中…" : "保存配置"}
          </button>
        </div>

        <McpTokensCard />

        <div className="card">
          <h2>Embedding</h2>
          <div className="card-sub">文档向量化模型，智谱 embedding-3（1024 维），系统级配置。</div>
          <div className="field">
            <label>Embedding 模型</label>
            <select value={embedModel} onChange={(e) => setEmbedModel(e.target.value)} className="field-select">
              <option value="embedding-3">embedding-3（智谱，1024 维）</option>
            </select>
          </div>
          <button className="btn" onClick={saveModels} disabled={savingModels}>
            {savingModels ? "保存中…" : "保存偏好"}
          </button>
        </div>

        <div className="card">
          <h2>账号</h2>
          <div className="card-sub">{user?.email}</div>
          <button className="btn-danger" onClick={logout}>退出登录</button>
        </div>

        {err && <div className="msg-error" style={{ marginTop: 12 }}>{err}</div>}
        {msg && <div className="msg-ok" style={{ marginTop: 12 }}>{msg}</div>}
      </div>
    </div>
  );
}
