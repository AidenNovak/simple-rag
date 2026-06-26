import { useEffect, useRef, useState } from "react";
import { api } from "../api.js";
import { useWorkspace } from "./WorkspaceStore.js";
import { useToast } from "../components/Toast.js";
import { DocPreview } from "../components/DocPreview.js";
import { SelectionContextBar } from "./SelectionContextBar.js";
import { IconNote, IconSave } from "../Icons.js";

function normalizeMath(text: string): string {
  return text
    .replace(/\\\[([\s\S]*?)\\\]/g, (_, m) => `$$${m}$$`)
    .replace(/\\\(([\s\S]*?)\\\)/g, (_, m) => `$${m}$`);
}

/** 中栏：note 编辑/预览/保存；非 note 文件触发 DocPreview overlay。 */
export function EditorPane() {
  const { state, dispatch } = useWorkspace();
  const toast = useToast();
  const taRef = useRef<HTMLTextAreaElement>(null);
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState(false);

  const save = async () => {
    if (!state.activeDocId) return;
    if (!state.draftTitle.trim() && !state.draftContent.trim()) { toast("error", "标题或正文不能为空"); return; }
    setSaving(true);
    try {
      await api.updateNote(state.activeDocId, state.draftTitle, state.draftContent);
      dispatch({ type: "MARK_CLEAN" });
      toast("success", "已保存，正在重新摄入…");
      window.dispatchEvent(new Event("ws:doc-saved"));
    } catch (e) {
      toast("error", `保存失败：${(e as Error).message}`);
    } finally { setSaving(false); }
  };

  // 引用 chip 跳转：定位 textarea 中近似片段并选中
  useEffect(() => {
    const onScrollTo = (e: Event) => {
      const needle = String((e as CustomEvent).detail || "");
      const ta = taRef.current;
      if (!ta || !needle) return;
      const idx = ta.value.indexOf(needle.slice(0, 80));
      if (idx >= 0) {
        ta.focus();
        ta.setSelectionRange(idx, idx + Math.min(needle.length, 200));
        ta.scrollTop = ta.value.substring(0, idx).split("\n").length * 22;
      }
    };
    window.addEventListener("workspace:scroll-to", onScrollTo);
    return () => window.removeEventListener("workspace:scroll-to", onScrollTo);
  }, []);

  // 选区提取：mouseup/keyup 后若 ≥10 字，dispatch SET_SELECTION
  const captureSelection = () => {
    const ta = taRef.current;
    if (!ta) return;
    const { selectionStart, selectionEnd } = ta;
    if (selectionEnd - selectionStart >= 10) {
      const text = ta.value.slice(selectionStart, selectionEnd);
      dispatch({ type: "SET_SELECTION", payload: { docId: state.activeDocId || "", text, start: selectionStart, end: selectionEnd } });
    }
  };

  // 非 note 文件：显示「预览」按钮打开 DocPreview
  const [previewDocId, setPreviewDocId] = useState<string | null>(null);
  useEffect(() => {
    if (state.activeDocKind === "upload" && state.activeDocId) setPreviewDocId(state.activeDocId);
    else setPreviewDocId(null);
  }, [state.activeDocKind, state.activeDocId]);

  // 空态
  if (!state.activeDocId) {
    return (
      <div className="ws-editor-empty" data-testid="editor-pane">
        <IconNote size={40} />
        <h2>工作台</h2>
        <p>从左侧打开或新建一篇笔记</p>
        <p className="muted">编辑保存 · 选中文字带入对话 · ⌘K 搜索</p>
      </div>
    );
  }

  // 文件类：只读预览入口
  if (state.activeDocKind === "upload") {
    return (
      <div className="ws-editor-empty" data-testid="editor-pane">
        <h2>{state.draftTitle}</h2>
        <p className="muted">该文件为上传类型，预览见弹层</p>
        <button className="btn" onClick={() => setPreviewDocId(state.activeDocId)}>预览文件</button>
        <DocPreview docId={previewDocId} onClose={() => setPreviewDocId(null)} />
      </div>
    );
  }

  return (
    <div className="ws-editor" data-testid="editor-pane">
      <div className="ws-editor-toolbar">
        <input
          className="ws-title-input"
          aria-label="标题"
          value={state.draftTitle}
          onChange={(e) => dispatch({ type: "SET_DRAFT_TITLE", payload: e.target.value })}
          placeholder="笔记标题"
        />
        <span className="muted" style={{ fontSize: 12 }}>{state.draftContent.length} 字</span>
        {state.dirty && <span className="ws-dirty-dot" title="有未保存修改" />}
        <button className="btn-secondary" style={{ fontSize: 12, padding: "4px 10px" }} onClick={() => setPreview((p) => !p)}>{preview ? "编辑" : "预览"}</button>
        <button className="btn" onClick={save} disabled={saving || (!state.dirty)} style={{ fontSize: 13 }}>
          <IconSave size={13} /> 保存
        </button>
      </div>

      <SelectionContextBar />

      {preview ? (
        <PreviewPane content={state.draftContent} />
      ) : (
        <textarea
          ref={taRef}
          className="ws-textarea"
          aria-label="正文"
          value={state.draftContent}
          onChange={(e) => dispatch({ type: "SET_DRAFT_CONTENT", payload: e.target.value })}
          onSelect={captureSelection}
          onKeyUp={captureSelection}
          placeholder="支持 Markdown…"
          spellCheck={false}
        />
      )}

      {/* doc_patch diff 条：AI 改文件后弹出，接受 = 同步到编辑器；拒绝 = 回滚 DB */}
      {state.pendingPatch && state.pendingPatch.docId === state.activeDocId && (
        <PatchBar
          patch={state.pendingPatch}
          onAccept={() => {
            dispatch({ type: "SET_DRAFT_CONTENT", payload: state.pendingPatch!.content });
            dispatch({ type: "SET_PENDING_PATCH", payload: null });
            dispatch({ type: "MARK_CLEAN" });
            toast("success", "已采纳 AI 修改");
          }}
          onReject={async () => {
            const p = state.pendingPatch!;
            try {
              await api.updateNote(p.docId, state.draftTitle, p.previousContent);
              dispatch({ type: "SET_DRAFT_CONTENT", payload: p.previousContent });
              dispatch({ type: "MARK_CLEAN" });
              toast("info", "已回滚");
            } catch { toast("error", "回滚失败"); }
            dispatch({ type: "SET_PENDING_PATCH", payload: null });
          }}
        />
      )}
    </div>
  );
}

/** 逐行 diff（LCS，无第三方库）。返回 add/del/ctx 行。 */
function lineDiff(a: string[], b: string[]): { type: "add" | "del" | "ctx"; text: string }[] {
  const n = a.length, m = b.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--)
    dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const out: { type: "add" | "del" | "ctx"; text: string }[] = [];
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) { out.push({ type: "ctx", text: a[i] }); i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) { out.push({ type: "del", text: a[i++] }); }
    else { out.push({ type: "add", text: b[j++] }); }
  }
  while (i < n) out.push({ type: "del", text: a[i++] });
  while (j < m) out.push({ type: "add", text: b[j++] });
  return out;
}

function PatchBar({ patch, onAccept, onReject }: {
  patch: { content: string; previousContent: string };
  onAccept: () => void; onReject: () => void;
}) {
  const diff = lineDiff(patch.previousContent.split("\n"), patch.content.split("\n"));
  const added = diff.filter((d) => d.type === "add").length;
  const removed = diff.filter((d) => d.type === "del").length;
  return (
    <div className="ws-patch-bar" data-testid="patch-bar">
      <div className="ws-patch-head">
        <strong>✏️ AI 修改了当前笔记</strong>
        <span className="diff-stat add">+{added}</span>
        <span className="diff-stat del">-{removed}</span>
        <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
          <button className="btn" style={{ fontSize: 12, padding: "3px 10px" }} onClick={onAccept}>采纳</button>
          <button className="btn-danger" style={{ fontSize: 12, padding: "3px 10px" }} onClick={onReject}>回滚</button>
        </div>
      </div>
      <div className="ws-patch-diff">
        {diff.map((d, i) => (
          <div key={i} className={`diff-line ${d.type}`}>
            <span className="diff-sign">{d.type === "add" ? "+" : d.type === "del" ? "-" : " "}</span>
            <span className="diff-text">{d.text || " "}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** 预览模式：惰性加载 markstream-react + katex（避免测试/编辑路径引入重依赖）。 */
function PreviewPane({ content }: { content: string }) {
  const [Mod, setMod] = useState<{ default: typeof import("markstream-react").default } | null>(null);
  useEffect(() => {
    let alive = true;
    import("katex/dist/katex.min.css");
    import("markstream-react").then((m) => { if (alive) setMod(m as any); });
    return () => { alive = false; };
  }, []);
  if (!Mod) return <div className="ws-editor-preview muted">渲染中…</div>;
  const R = Mod.default;
  return <div className="ws-editor-preview"><R content={normalizeMath(content)} final={true} fade={false} /></div>;
}
