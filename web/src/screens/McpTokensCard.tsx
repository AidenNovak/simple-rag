import { useEffect, useState } from "react";
import { api } from "../api.js";
import { useToast } from "../components/Toast.js";

interface McpToken {
  id: string;
  label: string | null;
  createdAt: string;
  lastUsedAt: string | null;
}

/**
 * MCP 接入 / Token 管理。
 *
 * 用户在此为本地 agent（Cursor / Claude Code / Codex）生成授权 token。
 * 明文 token 仅在创建时显示一次（DB 只存哈希），随后用预填好的接入配置片段
 * 一键复制到对应 harness 的配置文件。
 */
export function McpTokensCard() {
  const toast = useToast();
  const [tokens, setTokens] = useState<McpToken[]>([]);
  const [loading, setLoading] = useState(true);
  const [label, setLabel] = useState("");
  const [creating, setCreating] = useState(false);
  /** 刚生成的明文 token —— 仅显示一次，关闭即清空（DB 已无明文） */
  const [newToken, setNewToken] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const load = async () => {
    try {
      const r = await api.listMcpTokens();
      setTokens(r.tokens || []);
    } catch {
      /* 忽略加载错误，不阻塞页面 */
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const create = async () => {
    setCreating(true);
    try {
      const r = await api.createMcpToken(label.trim() || `token-${tokens.length + 1}`);
      setNewToken(r.token);
      setLabel("");
      toast("success", "Token 已生成（仅显示一次，请立即复制）");
      await load();
    } catch (e) {
      toast("error", (e as Error).message || "生成失败");
    } finally {
      setCreating(false);
    }
  };

  const revoke = async (id: string, lbl: string | null) => {
    if (!confirm(`确定吊销「${lbl || "未命名"}」？吊销后使用该 token 的 agent 将立即无法检索。`)) return;
    try {
      await api.revokeMcpToken(id);
      toast("success", "已吊销");
      await load();
    } catch (e) {
      toast("error", (e as Error).message || "吊销失败");
    }
  };

  const copy = async (text: string, key: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied((c) => (c === key ? null : c)), 1500);
    } catch {
      toast("error", "复制失败，请手动选择");
    }
  };

  // 接入配置：用当前站点地址 + 用户的明文 token 预填，省去手写
  const origin = typeof window !== "undefined" ? window.location.origin : "https://kb.meimaobing.ai";
  const tokenForConfig = newToken || "<YOUR_TOKEN>";
  const cursorConfig = JSON.stringify(
    { mcpServers: { kb: { url: `${origin}/api/mcp`, headers: { Authorization: `Bearer ${tokenForConfig}` } } } },
    null,
    2,
  );
  const codexConfig = `url = "${origin}/api/mcp"\nheaders = { Authorization = "Bearer ${tokenForConfig}" }`;

  const fmtDate = (s: string | null) => (s ? new Date(s).toLocaleString("zh-CN", { dateStyle: "short", timeStyle: "short" }) : "—");

  return (
    <div className="card">
      <h2>MCP 接入</h2>
      <div className="card-sub">
        为本地 AI 工具（Cursor / Claude Code / Codex）生成授权 token，让它们能检索你的知识库。每个 token 绑定你的账号，仅能访问你自己的数据，可随时吊销。
      </div>

      {/* 生成新 token */}
      <div className="field">
        <label>新建 token（给本地 agent 授权）</label>
        <div className="row" style={{ gap: 8 }}>
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="标签，如 Claude Code @ MBP"
            style={{ flex: 1 }}
          />
          <button className="btn" onClick={create} disabled={creating}>
            {creating ? "生成中…" : "生成 token"}
          </button>
        </div>
      </div>

      {/* 明文 token —— 仅显示一次 */}
      {newToken && (
        <div className="field" style={{ background: "rgba(16,163,127,0.06)", padding: 12, borderRadius: 8, marginTop: 8 }}>
          <label style={{ color: "#10a37f" }}>✓ Token 已生成 — 明文仅此一次，请立即复制保存</label>
          <div className="row" style={{ gap: 8, alignItems: "center" }}>
            <code
              style={{ flex: 1, fontFamily: "ui-monospace, monospace", fontSize: 12, wordBreak: "break-all", background: "rgba(0,0,0,0.04)", padding: "6px 8px", borderRadius: 4 }}
            >
              {newToken}
            </code>
            <button className="btn-secondary" onClick={() => copy(newToken, "token")}>
              {copied === "token" ? "已复制" : "复制"}
            </button>
            <button className="btn-secondary" onClick={() => setNewToken(null)}>关闭</button>
          </div>
          <div style={{ fontSize: 12, color: "#8A8178", marginTop: 6 }}>
            关闭后将无法再查看此 token（数据库只存哈希）。如丢失请新建。
          </div>
        </div>
      )}

      {/* 现有 token 列表（无明文） */}
      <div className="field">
        <label>已有 token（{tokens.length}）</label>
        {loading ? (
          <div style={{ fontSize: 13, color: "#8A8178" }}>加载中…</div>
        ) : tokens.length === 0 ? (
          <div style={{ fontSize: 13, color: "#8A8178" }}>还没有 token。生成第一个来接入你的 AI 工具。</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {tokens.map((t) => (
              <div key={t.id} className="row-between" style={{ padding: "8px 10px", border: "1px solid var(--border, rgba(0,0,0,0.08))", borderRadius: 8 }}>
                <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
                  <span style={{ fontSize: 14, fontWeight: 500 }}>{t.label || "未命名"}</span>
                  <span style={{ fontSize: 11, color: "#8A8178" }}>
                    创建 {fmtDate(t.createdAt)} · 最近使用 {fmtDate(t.lastUsedAt)}
                  </span>
                </div>
                <button className="btn-danger" style={{ fontSize: 12, padding: "4px 10px" }} onClick={() => revoke(t.id, t.label)}>
                  吊销
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 接入配置片段 —— 用 token 预填，方便直接复制到 harness */}
      <div className="field">
        <label>接入配置（{newToken ? "已用新 token 预填" : "生成 token 后自动填入"}）</label>
        <div style={{ fontSize: 12, color: "#8A8178", marginBottom: 6 }}>
          Cursor / Claude Code 复制下方 JSON 到 <code>.mcp.json</code> / <code>.cursor/mcp.json</code>；Codex 复制 TOML 片段到 <code>.codex/config.toml</code> 的 <code>[mcp_servers.kb]</code>。
        </div>
        <ConfigBlock title="Cursor / Claude Code（.mcp.json）" content={cursorConfig} onCopy={() => copy(cursorConfig, "cursor")} copied={copied === "cursor"} />
        <ConfigBlock title="Codex（.codex/config.toml）" content={codexConfig} onCopy={() => copy(codexConfig, "codex")} copied={copied === "codex"} />
      </div>
    </div>
  );
}

function ConfigBlock({ title, content, onCopy, copied }: { title: string; content: string; onCopy: () => void; copied: boolean }) {
  return (
    <div style={{ marginBottom: 8 }}>
      <div className="row-between" style={{ marginBottom: 4 }}>
        <span style={{ fontSize: 11, fontWeight: 600, color: "#5C534A" }}>{title}</span>
        <button className="btn-secondary" style={{ fontSize: 11, padding: "2px 8px" }} onClick={onCopy}>
          {copied ? "已复制" : "复制"}
        </button>
      </div>
      <pre
        style={{
          margin: 0, padding: 10, background: "rgba(0,0,0,0.04)", borderRadius: 6,
          fontFamily: "ui-monospace, monospace", fontSize: 12, lineHeight: 1.5,
          overflowX: "auto", whiteSpace: "pre-wrap", wordBreak: "break-all",
        }}
      >
        {content}
      </pre>
    </div>
  );
}
