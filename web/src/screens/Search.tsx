import { useState } from "react";
import { api } from "../api.js";
import { useToast } from "../components/Toast.js";

export function SearchScreen() {
  const toast = useToast();
  const [q, setQ] = useState("");
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const run = async () => {
    if (!q.trim()) return;
    setLoading(true);
    try {
      const r = await api.search(q, 10);
      setResults(r.results);
    } catch (e) {
      toast("error", `检索失败：${(e as Error).message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="panel">
      <div className="panel-inner">
        <h1>检索</h1>
        <div className="panel-sub">向量 + 关键词混合召回（RRF 融合），直接返回片段，不调用大模型。</div>

        <div className="card" style={{ display: "flex", gap: 8, padding: 12 }}>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && run()}
            placeholder="输入关键词或语义查询"
            style={{ background: "var(--bg-main)", border: "1px solid var(--border-light)", borderRadius: 8, padding: "10px 12px" }}
          />
          <button className="btn" onClick={run} disabled={loading}>{loading ? "检索中…" : "检索"}</button>
        </div>

        {results.map((r, i) => (
          <div key={i} className="card">
            <div className="row-between" style={{ marginBottom: 10 }}>
              <strong>{r.docTitle}</strong>
              <span className="badge" style={{ background: "var(--bg-main)", color: "var(--text-muted)" }}>
                {r.source} · {r.score.toFixed(3)}
              </span>
            </div>
            <div className="muted" style={{ fontSize: 13, lineHeight: 1.7 }}>{r.text}</div>
            {r.locator && (
              <div className="muted" style={{ fontSize: 12, marginTop: 10 }}>
                {Object.entries(r.locator).map(([k, v]) => `${k}=${v}`).join(" · ")}
              </div>
            )}
          </div>
        ))}

        {!loading && results.length === 0 && q && (
          <div className="muted" style={{ textAlign: "center", padding: 32 }}>无匹配结果</div>
        )}
      </div>
    </div>
  );
}
