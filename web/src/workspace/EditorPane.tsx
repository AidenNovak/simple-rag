import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../api.js";
import { useWorkspace } from "./WorkspaceStore.js";
import { useToast } from "../components/Toast.js";
import { DocPreview } from "../components/DocPreview.js";
import { SelectionContextBar } from "./SelectionContextBar.js";
import { CraftBody } from "./craft/CraftBody.js";
import { SourcePeek } from "./craft/SourcePeek.js";
import { scrollCraftToSnippet } from "./craft/scrollToSnippet.js";
import { extractToc } from "./craft/extractToc.js";
import { computeStats } from "./craft/computeStats.js";
import { TocPanel } from "./TocPanel.js";
import { IconNote } from "../Icons.js";

type SaveStatus = "saved" | "dirty" | "saving";

/** 中栏 Live Craft 编辑器：默认 MD 渲染，双击/E 开 SourcePeek 源码编辑，
 *  Pick 选区，引用跳转 scroll+flash；非 note 文件触发 DocPreview。 */
export function EditorPane() {
  const { state, dispatch } = useWorkspace();
  const toast = useToast();
  const craftRef = useRef<HTMLDivElement>(null);
  const [peekOpen, setPeekOpen] = useState(false);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("saved");
  const toc = extractToc(state.draftContent);
  const stats = computeStats(state.draftContent);
  const [previewDocId, setPreviewDocId] = useState<string | null>(null);

  // 持久化：Title blur 或 SourcePeek autosave 调用
  const persist = useCallback(async (content: string) => {
    if (!state.activeDocId) return;
    if (!content.trim()) return;
    setSaveStatus("saving");
    try {
      await api.updateNote(state.activeDocId, state.draftTitle, content);
      dispatch({ type: "MARK_CLEAN" });
      setSaveStatus("saved");
      window.dispatchEvent(new Event("ws:doc-saved"));
    } catch (e) {
      setSaveStatus("dirty");
      toast("error", `保存失败：${(e as Error).message}`);
    }
  }, [state.activeDocId, state.draftTitle, dispatch, toast]);

  useEffect(() => { setSaveStatus(state.dirty ? "dirty" : "saved"); }, [state.dirty]);

  // 引用 chip 跳转：Craft 内 scroll + flash
  useEffect(() => {
    const onScrollTo = (e: Event) => {
      const snippet = String((e as CustomEvent).detail || "");
      const el = craftRef.current;
      if (!el || !snippet) return;
      scrollCraftToSnippet(el, state.draftContent, snippet);
    };
    window.addEventListener("workspace:scroll-to", onScrollTo);
    return () => window.removeEventListener("workspace:scroll-to", onScrollTo);
  }, [state.draftContent]);

  // 键盘 `e` 打开 SourcePeek（非 textarea 焦点时）
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "e" && !peekOpen && document.activeElement?.tagName !== "TEXTAREA" && document.activeElement?.tagName !== "INPUT") {
        setPeekOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [peekOpen]);

  useEffect(() => {
    setPreviewDocId(state.activeDocKind === "upload" && state.activeDocId ? state.activeDocId : null);
  }, [state.activeDocKind, state.activeDocId]);

  // Craft 内 Pick 选区 → SET_SELECTION
  const onPick = (text: string) => {
    const idx = state.draftContent.indexOf(text);
    dispatch({
      type: "SET_SELECTION",
      payload: {
        docId: state.activeDocId || "",
        text,
        start: idx >= 0 ? idx : 0,
        end: idx >= 0 ? idx + text.length : text.length,
      },
    });
  };

  // 空态
  if (!state.activeDocId) {
    return (
      <div className="ws-editor-empty" data-testid="editor-pane">
        <IconNote size={40} />
        <h2>工作台</h2>
        <p>从左侧打开或新建一篇笔记</p>
        <p className="muted">双击正文编辑 · 选中文字带入对话 · ⌘K 搜索</p>
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
    <div className="ws-editor ws-craft" data-testid="editor-pane">
      <div className="ws-editor-toolbar">
        <input
          className="ws-title-input"
          aria-label="标题"
          value={state.draftTitle}
          onChange={(e) => dispatch({ type: "SET_DRAFT_TITLE", payload: e.target.value })}
          onBlur={() => { if (state.dirty) persist(state.draftContent); }}
          placeholder="笔记标题"
        />
        <span className="ws-writing-stats">{stats.words} 字 · {stats.readTimeMin} 分钟 · {stats.paragraphs} 段</span>
        <span className="ws-save-pill" data-status={saveStatus === "dirty" ? "pending" : saveStatus === "saving" ? "saving" : "idle"}>
          {saveStatus === "saving" ? "保存中" : saveStatus === "dirty" ? "未保存" : "已保存"}
        </span>
      </div>

      <SelectionContextBar />

      <CraftBody
        content={state.draftContent}
        onOpenPeek={() => setPeekOpen(true)}
        onPick={onPick}
        scrollContainerRef={craftRef}
      />

      <TocPanel toc={toc} scrollContainerRef={craftRef} />

      <SourcePeek
        open={peekOpen}
        content={state.draftContent}
        onChange={(v) => dispatch({ type: "SET_DRAFT_CONTENT", payload: v })}
        onClose={() => setPeekOpen(false)}
        onSave={persist}
      />

      {/* doc_patch diff 条：AI 改文件后弹出，接受 = 同步到 Craft；拒绝 = 回滚 DB */}
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
