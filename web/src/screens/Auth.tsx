import { useState } from "react";
import { api } from "../api.js";
import { IconBook } from "../Icons.js";

export function AuthScreen({ onDone }: { onDone: (token: string, user: any) => void }) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    setErr("");
    setLoading(true);
    try {
      const r = mode === "login"
        ? await api.login(email, password)
        : await api.register(email, password);
      onDone(r.token, r.user);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <div style={{ textAlign: "center", marginBottom: 24 }}>
          <div style={{ marginBottom: 8, display: "flex", justifyContent: "center", color: "var(--text-secondary)" }}>
            <IconBook size={36} />
          </div>
          <div style={{ fontSize: 20, fontWeight: 600 }}>私人知识库</div>
          <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>基于 DeepSeek 的 RAG 知识库</div>
        </div>

        <div className="auth-tabs">
          {(["login", "register"] as const).map((m) => (
            <button
              key={m}
              className={`auth-tab ${mode === m ? "active" : ""}`}
              onClick={() => setMode(m)}
            >
              {m === "login" ? "登录" : "注册"}
            </button>
          ))}
        </div>

        <div className="field">
          <label>邮箱</label>
          <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
        </div>
        <div className="field">
          <label>密码 {mode === "register" && <span className="muted">（至少 8 位）</span>}</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
            placeholder="••••••••"
          />
        </div>

        {err && <div className="msg-error" style={{ marginBottom: 12 }}>{err}</div>}

        <button
          className="btn"
          onClick={submit}
          disabled={loading || !email || !password}
          style={{ width: "100%" }}
        >
          {loading ? "处理中…" : mode === "login" ? "登录" : "创建账号"}
        </button>

        <div className="auth-foot">
          {mode === "login" ? "还没有账号？" : "已有账号？"}
          <a onClick={() => setMode(mode === "login" ? "register" : "login")} style={{ marginLeft: 4, cursor: "pointer" }}>
            {mode === "login" ? "注册" : "登录"}
          </a>
        </div>
      </div>
    </div>
  );
}
