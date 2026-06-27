import { useEffect, useRef, useState } from "react";
import { api, getToken } from "../api.js";
import { IconSend, IconSpinner, IconTool, IconSource, IconCopy, IconCheck, IconRefresh, IconStop, IconDeepSeek, IconLibrary, IconNote, IconGlobe } from "../Icons.js";
import { NotePanel } from "../components/NotePanel.js";
import { useToast } from "../components/Toast.js";
import { DocPreview } from "../components/DocPreview.js";
import MarkdownRender, { TextNode, type NodeComponentProps } from "markstream-react";
import "markstream-react/index.css";
import "katex/dist/katex.min.css";

/** 行内 [n] 引用角标 → 蓝色徽标（与下方 cite-chip 一致）。
 *  仅作用于正文 text 节点；代码块内的 [n] 由解析器归入 code_block，不受影响。
 *  无匹配时回落到默认 TextNode，保留全部默认行为（center、children 等）。 */
const INLINE_CITE_RE = /\[(\d{1,3})\]/;
function CitationTextNode(props: NodeComponentProps<{ type: "text"; content: string; center?: boolean }>) {
  const content = props.node?.content ?? "";
  if (props.children || !content || !INLINE_CITE_RE.test(content)) return <TextNode {...props} />;
  const segs = content.split(INLINE_CITE_RE); // [文本, 编号, 文本, 编号, ...]
  return (
    <span className={"text-node whitespace-pre-wrap break-words" + (props.node.center ? " text-node-center" : "")}>
      {segs.map((s, i) => i % 2 === 1
        ? <sup key={i} className="inline-cite">[{s}]</sup>
        : <span key={i}>{s}</span>)}
    </span>
  );
}
const MARKSTREAM_CUSTOM = { text: CitationTextNode };

/**
 * 把 LaTeX 格式（\[...\] 和 \(...\)）转成 markdown math（$$...$$ 和 $...$）。
 * DeepSeek 常用 \[...\] 格式，markstream 期望 $$...$$ 格式。
 */
function normalizeMath(text: string): string {
  return text
    .replace(/\\\[([\s\S]*?)\\\]/g, (_, math) => `$$${math}$$`)
    .replace(/\\\(([\s\S]*?)\\\)/g, (_, math) => `$${math}$`);
}

interface Citation {
  n: number; docId: string; docTitle: string;
  locator: Record<string, string | number> | null; snippet: string;
}
interface ToolCall { name: string; args: unknown; resultPreview: string; resultFull?: string; done?: boolean; type?: "tool" | "search" }
/** 时间轴活动：按发生时序排列的推理/工具/搜索事件 */
interface Activity {
  id: string;
  type: "reasoning" | "tool" | "search";
  text?: string;   // reasoning 文本（增量追加）
  tool?: ToolCall; // tool/search 调用详情
}
interface Msg { role: "user" | "assistant"; content: string; citations?: Citation[]; toolCalls?: ToolCall[]; activities?: Activity[]; loading?: boolean; error?: boolean; followUps?: string[]; stopped?: boolean; reasoning?: string }

interface Props {
  activeConvo: string | null;
  chatModel?: string | null;
  onConvoCreated: (id: string, title: string) => void;
  onModelChange?: (model: string) => void;
  /** 工作台：当前打开的笔记 id（注入对话上下文）。 */
  contextDocId?: string | null;
  /** 工作台：用户在编辑器选中的片段（优先作为对话上下文）。 */
  selection?: string | null;
  /** 工作台：agent 通过 update_note 改了当前笔记时回调，通知刷新 + 出 diff。 */
  onNoteUpdated?: (docId: string) => void;
}

const TOOL_LABEL: Record<string, string> = {
  search_knowledge_base: "检索知识库",
  keyword_search: "关键词检索",
  list_documents: "列出文档",
  get_document_status: "查询状态",
  create_note: "创建笔记",
  list_notes: "列出笔记",
  get_note: "查看笔记",
  update_note: "修改笔记",
  delete_note: "删除笔记",
  append_note: "追加笔记",
  get_time: "🕐 获取时间",
  web_search: "🌐 网络搜索",
  web_scrape: "🌐 网页抓取",
};

export function ChatView({ activeConvo, chatModel, onConvoCreated, onModelChange, contextDocId, selection, onNoteUpdated }: Props) {
  const toast = useToast();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [readyCount, setReadyCount] = useState<number | null>(null);
  const [previewDoc, setPreviewDoc] = useState<string | null>(null);
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);
  const [modelMenuOpen, setModelMenuOpen] = useState(false);
  const [scopeMenuOpen, setScopeMenuOpen] = useState(false);
  const [allDocs, setAllDocs] = useState<any[]>([]);
  const [scopeDocIds, setScopeDocIds] = useState<string[] | null>(null); // null = 全部
  const [notePanel, setNotePanel] = useState<{ title: string; content: string; noteId?: string } | null>(null);
  const [expandedTool, setExpandedTool] = useState<string | null>(null);
  const [contextTokens, setContextTokens] = useState<number | null>(null);
  // 网络搜索开关（默认关闭；开启后 agent 可调用 web_search/web_scrape）。localStorage 持久化。
  const [webSearch, setWebSearch] = useState<boolean>(() => {
    try { return localStorage.getItem("kb.webSearch") === "1"; } catch { return false; }
  });
  const toggleWebSearch = () => {
    setWebSearch((v) => {
      const next = !v;
      try { localStorage.setItem("kb.webSearch", next ? "1" : "0"); } catch {}
      toast("info", next ? "已开启网络搜索 · 可联网检索最新信息" : "已关闭网络搜索 · 仅检索知识库");
      return next;
    });
  };
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const loadedConvoRef = useRef<string | null>(null);
  const lastQuestionRef = useRef<string>("");

  // 加载会话历史
  useEffect(() => {
    if (!activeConvo) { setMessages([]); loadedConvoRef.current = null; return; }
    if (loadedConvoRef.current === activeConvo) return;
    // 切换会话时中止正在进行的流式请求，防答案泄漏到错误会话
    if (abortRef.current) { abortRef.current.abort(); abortRef.current = null; setBusy(false); }
    loadedConvoRef.current = activeConvo;
    api.getMessages(activeConvo).then((r) => {
      setMessages(
        (r.messages || [])
          .filter((m: any) => m.role === "user" || m.role === "assistant")
          .map((m: any) => ({
            role: m.role, content: m.content, citations: m.citations,
            toolCalls: ((m.usage && m.usage.toolCalls) || []).map((t: any) => ({ ...t, done: true })),
          }))
      );
    }).catch(() => setMessages([]));
  }, [activeConvo]);

  useEffect(() => {
    api.listDocs().then((r) => {
      const ready = (r.documents || []).filter((d: any) => d.status === "ready");
      setReadyCount(ready.length);
      setAllDocs(ready);
    }).catch(() => {});
  }, [messages.length]);

  // 切换会话时加载该会话的文档范围
  useEffect(() => {
    if (!activeConvo) { setScopeDocIds(null); return; }
    api.getMessages(activeConvo).then(() => {}).catch(() => {});
    // 从 conversations 列表拿 scope（通过 listConversations）
    api.listConversations().then((r) => {
      const conv = (r.conversations || []).find((c: any) => c.id === activeConvo);
      setScopeDocIds(conv?.scopeDocIds || null);
    }).catch(() => {});
  }, [activeConvo]);

  const toggleDocInScope = (docId: string) => {
    setScopeDocIds((prev) => {
      const current = prev || allDocs.map((d) => d.id); // null = 全选
      const next = current.includes(docId)
        ? current.filter((id) => id !== docId)
        : [...current, docId];
      // 如果选了全部 = 等于 null（不限）
      const result = next.length === allDocs.length ? null : next;
      // 保存到后端
      if (activeConvo) api.setConversationScope(activeConvo, result).catch(() => {});
      return result;
    });
  };

  // 自动滚动到底部（节流防抖动 + 用户上滚时不强制拉回）
  const autoStick = useRef(true);
  const scrollRaf = useRef<number | null>(null);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    // 用户手动上滚时停止自动跟随
    const onScroll = () => {
      const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
      autoStick.current = nearBottom;
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);
  useEffect(() => {
    if (!autoStick.current) return; // 用户在看上面的内容，不强制拉回
    if (scrollRaf.current) cancelAnimationFrame(scrollRaf.current);
    scrollRaf.current = requestAnimationFrame(() => {
      const el = scrollRef.current;
      if (el) el.scrollTop = el.scrollHeight; // instant，不用 smooth 避免抖动
    });
  }, [messages]);

  useEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = Math.min(ta.scrollHeight, 200) + "px";
  }, [input]);

  /** 核心：流式问答（可被 AbortController 中断）。question 可外部传入（重试）。 */
  const runAsk = async (question: string) => {
    if (!question.trim() || busy) return;
    lastQuestionRef.current = question;
    setInput("");
    setBusy(true);
    setMessages((m) => [...m, { role: "user", content: question }, { role: "assistant", content: "", loading: true }]);

    const ac = new AbortController();
    abortRef.current = ac;
    let flushTimer: ReturnType<typeof setInterval> | null = null;

    try {
      const res = await fetch(`/api/chat/stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({ question, conversationId: activeConvo || undefined, webSearch, ...(contextDocId ? { contextDocId } : {}), ...(selection ? { selection } : {}) }),
        signal: ac.signal,
      });
      if (!res.ok || !res.body) {
        const e = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        throw new Error(e.error);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      let answerAcc = "";
      // 时间轴活动列表（按发生时序：reasoning → tool/search → reasoning → ...）
      const activities: Activity[] = [];
      let actIdSeq = 0;
      // reasoning 多轮分隔标记：收到 toolCalls/delta 后置 true，下一个 reasoning 片段新建一个 activity
      let reasoningNewRound = false;
      // 把 activities 刷到 DOM
      const flushActivities = () => {
        setMessages((m) => {
          const c = [...m]; const last = { ...c[c.length - 1] };
          last.activities = activities.map((a) => ({ ...a })); c[c.length - 1] = last; return c;
        });
      };

      // 缓冲节流：每 150ms 把累积的 answerAcc 刷到 DOM，而非每个 token 都刷
      // 这是长答案不卡的关键——markstream 每次 content 变化都全量重解析 Markdown
      const flushToDOM = () => {
        setMessages((m) => {
          const c = [...m];
          c[c.length - 1] = { ...c[c.length - 1], content: answerAcc, activities: activities.map((a) => ({ ...a })) };
          return c;
        });
      };
      flushTimer = setInterval(flushToDOM, 150);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const frames = buf.split("\n\n");
        buf = frames.pop() || "";
        for (const frame of frames) {
          const lines = frame.split("\n");
          let evtName = "message";
          let dataLine = "";
          for (const line of lines) {
            if (line.startsWith("event:")) evtName = line.slice(6).trim();
            else if (line.startsWith("data:")) dataLine = line.slice(5).trim();
          }
          if (!dataLine || dataLine.startsWith(":")) continue; // 跳过心跳注释和空行
          let data: any;
          try { data = JSON.parse(dataLine); } catch { continue; } // 容错：跳过损坏的帧而非崩溃

          switch (evtName) {
            case "citations":
              setMessages((m) => {
                const c = [...m]; const last = { ...c[c.length - 1] };
                last.citations = data; c[c.length - 1] = last; return c;
              });
              break;
            case "toolCalls":
              setMessages((m) => {
                const c = [...m]; const last = { ...c[c.length - 1] };
                // 追加到已有 toolCalls（而非替换），让用户看到逐次工具调用
                const newTools = data.map((t: any) => ({ ...t, done: true }));
                last.toolCalls = [...(last.toolCalls || []), ...newTools];
                // 同步追加到 activities 时间轴（每个工具一个节点）
                for (const t of newTools) {
                  const isSearch = t.name === "web_search" || t.name === "web_scrape";
                  activities.push({
                    id: `act-${actIdSeq++}`,
                    type: isSearch ? "search" : "tool",
                    tool: t,
                  });
                }
                last.activities = activities.map((a) => ({ ...a }));
                c[c.length - 1] = last; return c;
              });
              // 工具执行后下一轮 reasoning 是新一轮
              reasoningNewRound = true;
              break;
            case "reasoning":
              setMessages((m) => {
                const c = [...m]; const last = { ...c[c.length - 1] };
                // 同轮续片：追加到最后一个 reasoning activity
                // 新一轮：新建一个 reasoning activity
                const lastAct = activities[activities.length - 1];
                if (!reasoningNewRound && lastAct && lastAct.type === "reasoning") {
                  lastAct.text = (lastAct.text || "") + (data.content || "");
                } else {
                  activities.push({ id: `act-${actIdSeq++}`, type: "reasoning", text: data.content || "" });
                  reasoningNewRound = false;
                }
                // 同步 reasoning 字段（历史回显兼容 + summary 文本）
                const prevReasoning = last.reasoning || "";
                const sep = (reasoningNewRound && prevReasoning.length > 0) ? "\n\n---\n\n" : "";
                last.reasoning = prevReasoning + sep + (data.content || "");
                last.activities = activities.map((a) => ({ ...a }));
                c[c.length - 1] = last; return c;
              });
              break;
            case "error":
              throw new Error(data.error || "stream error");
            case "done":
              clearInterval(flushTimer);
              flushToDOM();
              if (!activeConvo && data.conversationId) {
                onConvoCreated(data.conversationId, question.slice(0, 40));
              }
              if (data.usage?.prompt_tokens) setContextTokens(data.usage.prompt_tokens);
              setMessages((m) => {
                const c = [...m];
                c[c.length - 1] = { ...c[c.length - 1], content: answerAcc || (c[c.length-1] as any).content || "", loading: false, followUps: data.followUps || [], activities: activities.map((a) => ({ ...a })), toolCalls: (c[c.length-1] as any).toolCalls };
                return c;
              });
              // 工作台联动：agent 调用 update_note 改了当前笔记 → 通知刷新 + 出 diff
              if (onNoteUpdated && contextDocId) {
                const updatedId = activities
                  .filter((a) => a.tool?.name === "update_note" && (a.tool.args as any)?.note_id === contextDocId)
                  .map((a) => (a.tool!.args as any).note_id)[0];
                if (updatedId) onNoteUpdated(updatedId);
              }
              break;
            default:
              // 流式 delta：累积到 answerAcc，但不每次都触发 React 重渲染
              // 用缓冲节流：每 150ms 更新一次 DOM，避免长答案时每次 token 重解析 Markdown
              answerAcc += data.delta || "";
              reasoningNewRound = true; // 答案流式后若再有 reasoning，视为新一轮
          }
        }
      }
    } catch (e) {
      // 错误时先 flush 最后的缓冲内容（不丢失已渲染的部分）
      if (flushTimer) { clearInterval(flushTimer); }
      const aborted = (e as any).name === "AbortError";
      const isNetworkError = (e as any).message?.includes("network") || (e as any).message?.includes("fetch") || (e as Error).message === "aborted";
      setMessages((m) => {
        const copy = [...m];
        const last = copy[copy.length - 1];
        if (aborted || isNetworkError) {
          // 保留已有部分内容（不覆盖），标记 stopped
          copy[copy.length - 1] = { ...last, loading: false, stopped: true };
        } else {
          // 服务端错误：保留已有内容 + 追加错误提示（不覆盖）
          const existing = last.content || "";
          const errMsg = existing ? "\n\n⚠️ " + (e as Error).message : `⚠️ ${(e as Error).message}`;
          copy[copy.length - 1] = { ...last, content: existing + errMsg, loading: false, error: true };
        }
        return copy;
      });
    } finally {
      if (flushTimer) clearInterval(flushTimer);
      setBusy(false);
      abortRef.current = null;
    }
  };

  const ask = () => runAsk(input.trim());
  const stop = () => { abortRef.current?.abort(); };
  const retry = () => {
    // 删除最后一条 assistant（可能是错误/中断），重问
    setMessages((m) => {
      const c = m.slice();
      if (c.length && c[c.length - 1].role === "assistant") c.pop();
      return c;
    });
    runAsk(lastQuestionRef.current);
  };

  const copyMsg = async (i: number, content: string) => {
    try {
      await navigator.clipboard.writeText(content);
      setCopiedIdx(i);
      toast("success", "已复制到剪贴板");
      setTimeout(() => setCopiedIdx(null), 2000);
    } catch { toast("error", "复制失败"); }
  };

  const isEmpty = messages.length === 0;
  const noDocs = readyCount !== null && readyCount === 0;
  const lastMsg = messages[messages.length - 1];
  const isThinking = busy && lastMsg?.role === "assistant" && !lastMsg.content;

  return (
    <div className="main">
      <div className="main-header">
        <div className="title">知识库问答</div>
        <div className="row" style={{ gap: 12 }}>
          {/* 文档范围选择器 */}
          {allDocs.length > 0 && (
            <div className="model-switcher">
              <button className="scope-badge" onClick={() => setScopeMenuOpen((v) => !v)}>
                <IconLibrary size={13} />
                {scopeDocIds === null ? "全部文档" : `${scopeDocIds.length} 篇`}
                <span style={{ fontSize: 10, opacity: 0.6 }}>▼</span>
              </button>
              {scopeMenuOpen && (
                <div className="model-dropdown" style={{ minWidth: 260 }}>
                  <div style={{ padding: "8px 12px", fontSize: 12, color: "var(--text-muted)" }}>选择本会话检索的文档</div>
                  {allDocs.map((d) => {
                    const checked = scopeDocIds === null || scopeDocIds.includes(d.id);
                    return (
                      <label key={d.id} className="scope-item" onClick={(e) => { e.stopPropagation(); toggleDocInScope(d.id); }}>
                        <input type="checkbox" checked={checked} readOnly style={{ cursor: "pointer" }} />
                        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.title}</span>
                      </label>
                    );
                  })}
                  <div className="scope-actions">
                    <button className="btn-secondary" style={{ fontSize: 12, padding: "4px 10px" }} onClick={(e) => { e.stopPropagation(); setScopeDocIds(null); if (activeConvo) api.setConversationScope(activeConvo, null).catch(()=>{}); }}>全选</button>
                  </div>
                </div>
              )}
            </div>
          )}
          {chatModel && (
            <div className="model-switcher">
              <button className="model-badge" onClick={() => setModelMenuOpen((v) => !v)}>
                <IconDeepSeek size={13} /> {chatModel}
                <span style={{ fontSize: 10, opacity: 0.6 }}>▼</span>
              </button>
              {modelMenuOpen && (
                <div className="model-dropdown">
                  <div
                    className={`model-option ${chatModel === "deepseek-v4-pro" ? "active" : ""}`}
                    onClick={() => { onModelChange?.("deepseek-v4-pro"); setModelMenuOpen(false); toast("info", "已切换至 deepseek-v4-pro（推理增强）"); }}
                  >
                    <IconDeepSeek size={14} />
                    <div>
                      <div style={{ fontWeight: 500 }}>deepseek-v4-pro</div>
                      <div className="muted" style={{ fontSize: 11 }}>推理增强 · 1M 上下文</div>
                    </div>
                  </div>
                  <div
                    className={`model-option ${chatModel === "deepseek-v4-flash" ? "active" : ""}`}
                    onClick={() => { onModelChange?.("deepseek-v4-flash"); setModelMenuOpen(false); toast("info", "已切换至 deepseek-v4-flash（快速）"); }}
                  >
                    <IconDeepSeek size={14} />
                    <div>
                      <div style={{ fontWeight: 500 }}>deepseek-v4-flash</div>
                      <div className="muted" style={{ fontSize: 11 }}>快速响应 · 128K 上下文</div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
          {contextTokens !== null && (
            <ContextBar tokens={contextTokens} model={chatModel || "deepseek-v4-pro"} />
          )}
          {readyCount !== null && (
            <span className="muted" style={{ fontSize: 13 }}>{readyCount} 篇文档</span>
          )}
        </div>
      </div>

      <div className="chat-scroll" ref={scrollRef}>
        {isEmpty ? (
          <div className="chat-empty">
            <div style={{ fontSize: 40, marginBottom: 16, opacity: 0.3 }}><IconDeepSeek size={48} /></div>
            <h1>向你的知识库提问</h1>
            <div className="hint">
              {readyCount === 0
                ? "知识库还是空的。先上传文档或写一篇笔记，即可开始问答。"
                : "答案会标注来源，点击引用可定位到原文。"}
            </div>
            {readyCount === 0 && (
              <div style={{ marginTop: 24, display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
                <button className="btn" style={{ background: "var(--accent)", color: "var(--accent-text)", padding: "10px 24px", borderRadius: 999, border: "none", cursor: "pointer", fontSize: 15 }} onClick={() => window.dispatchEvent(new CustomEvent("nav", { detail: "documents" }))}>📚 上传文档</button>
                <button className="btn" style={{ background: "var(--bg-elevated)", color: "var(--text)", padding: "10px 24px", borderRadius: 999, border: "1px solid var(--border-light)", cursor: "pointer", fontSize: 15 }} onClick={() => window.dispatchEvent(new CustomEvent("nav", { detail: "notes" }))}>✏️ 写笔记</button>
              </div>
            )}
            {readyCount !== null && readyCount > 0 && readyCount <= 3 && (
              <div style={{ marginTop: 20, opacity: 0.5, fontSize: 13 }}>
                💡 试试问：「总结一下我的文档内容」
              </div>
            )}
          </div>
        ) : (
          <div className="chat-stream">
            {messages.map((m, i) => (
              <div key={i} className={`msg ${m.role}`}>
                <div className="role-label">
                  {m.role === "user" ? "你" : (
                    <span className="row" style={{ gap: 5 }}>
                      <IconDeepSeek size={13} /> 知识库助手
                    </span>
                  )}
                </div>
                {/* 活动时间轴：思考 / 工具 / 搜索 按时序排列 */}
                {m.role === "assistant" && (() => {
                  // 构建 activities：优先用已有的；历史回显降级从 toolCalls 构建（无 reasoning）
                  let acts = m.activities;
                  if ((!acts || acts.length === 0) && m.toolCalls && m.toolCalls.length > 0) {
                    acts = m.toolCalls.map((t, j) => ({
                      id: `hist-${i}-${j}`,
                      type: (t.name === "web_search" || t.name === "web_scrape") ? "search" as const : "tool" as const,
                      tool: t,
                    }));
                  }
                  if (!acts || acts.length === 0) {
                    // 纯思考中（无任何活动），显示占位
                    if (m.loading && !m.content) {
                      return (
                        <div className="activity-timeline">
                          <div className="activity-node reasoning">
                            <div className="activity-card reasoning">
                              <div className="activity-head"><IconSpinner size={13} className="spin-small" /> 正在思考…</div>
                            </div>
                          </div>
                        </div>
                      );
                    }
                    return null;
                  }
                  // loading 时展开显示；完成后折叠为 summary
                  if (m.loading) {
                    return (
                      <div className="activity-timeline">
                        {acts.map((a, j) => {
                          const key = `${i}-${a.id}`;
                          const isReasoning = a.type === "reasoning";
                          const isSearch = a.type === "search";
                          const t = a.tool;
                          const argStr = t?.args ? (typeof t.args === "object" ? JSON.stringify(t.args).slice(0, 100) : String(t.args).slice(0, 100)) : "";
                          const label = t ? (TOOL_LABEL[t.name] || t.name) : "思考";
                          // get_time 简短摘要
                          const timeSummary = t?.name === "get_time" && t?.resultFull ? t.resultFull.split("\n").find((l) => l.includes("本地时间")) || t.resultFull.slice(0, 50) : "";
                          return (
                            <div key={j} className={`activity-node ${a.type}`}>
                              <div className={`activity-card ${a.type}`}>
                                <div className="activity-head" style={{ cursor: (!isReasoning && t?.resultFull) ? "pointer" : "default" }}
                                  onClick={() => (!isReasoning && t?.resultFull) && setExpandedTool(expandedTool === key ? null : key)}>
                                  {isReasoning ? <span className="activity-icon">💭</span> : isSearch ? <IconGlobe size={13} /> : <IconTool size={13} />}
                                  <span className="activity-title">{label}</span>
                                  {!isReasoning && (timeSummary
                                    ? <span className="muted activity-sub">{timeSummary}</span>
                                    : argStr && <span className="muted activity-sub">{argStr}</span>)}
                                  {!isReasoning && t?.done && <IconCheck size={11} className="activity-check" />}
                                </div>
                                {isReasoning && a.text && (
                                  <div className="activity-reasoning">{a.text}</div>
                                )}
                                {!isReasoning && expandedTool === key && t?.resultFull && (
                                  <div className="activity-detail">{t.resultFull}</div>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    );
                  }
                  // 完成后：折叠为紧凑 summary
                  const stepCount = acts.length;
                  const searchCount = acts.filter((a) => a.type === "search").length;
                  return (
                    <details className="activity-summary">
                      <summary>📋 推理过程 · {stepCount} 步{searchCount > 0 ? `（含 ${searchCount} 次联网搜索）` : ""}</summary>
                      <div className="activity-timeline compact">
                        {acts.map((a, j) => {
                          const key = `${i}-${a.id}`;
                          const isReasoning = a.type === "reasoning";
                          const isSearch = a.type === "search";
                          const t = a.tool;
                          const argStr = t?.args ? (typeof t.args === "object" ? JSON.stringify(t.args).slice(0, 100) : String(t.args).slice(0, 100)) : "";
                          const label = t ? (TOOL_LABEL[t.name] || t.name) : "思考";
                          const timeSummary = t?.name === "get_time" && t?.resultFull ? t.resultFull.split("\n").find((l) => l.includes("本地时间")) || t.resultFull.slice(0, 50) : "";
                          return (
                            <div key={j} className={`activity-node ${a.type}`}>
                              <div className={`activity-card ${a.type}`}>
                                <div className="activity-head" style={{ cursor: (!isReasoning && t?.resultFull) ? "pointer" : "default" }}
                                  onClick={() => (!isReasoning && t?.resultFull) && setExpandedTool(expandedTool === key ? null : key)}>
                                  {isReasoning ? <span className="activity-icon">💭</span> : isSearch ? <IconGlobe size={13} /> : <IconTool size={13} />}
                                  <span className="activity-title">{label}</span>
                                  {!isReasoning && (timeSummary
                                    ? <span className="muted activity-sub">{timeSummary}</span>
                                    : argStr && <span className="muted activity-sub">{argStr}</span>)}
                                </div>
                                {isReasoning && a.text && (
                                  <div className="activity-reasoning">{a.text}</div>
                                )}
                                {!isReasoning && expandedTool === key && t?.resultFull && (
                                  <div className="activity-detail">{t.resultFull}</div>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </details>
                  );
                })()}
                <div className={`bubble ${m.loading && !m.content ? "typing-cursor" : ""}`}>
                  {m.role === "assistant" ? (
                    <MarkdownRender content={normalizeMath(m.content)} final={!m.loading} fade={false} dark customComponents={MARKSTREAM_CUSTOM} />
                  ) : (
                    m.content
                  )}
                </div>

                {m.citations && m.citations.length > 0 && (
                  <div className="citations">
                    <div className="cite-label"><IconSource size={12} /> 引用来源</div>
                    {m.citations.map((c) => (
                      <span
                        key={c.n} className="cite-chip" title={c.snippet}
                        onClick={() => setPreviewDoc(c.docId)}
                        role="button" tabIndex={0}
                        onKeyDown={(e) => { if (e.key === "Enter") setPreviewDoc(c.docId); }}
                      >
                        <span className="cite-n">[{c.n}]</span>
                        <span className="cite-title">
                          {c.docTitle}
                          {c.locator && " · " + Object.entries(c.locator).map(([k, v]) => `${k}=${v}`).join(" ")}
                        </span>
                      </span>
                    ))}
                  </div>
                )}

                {/* 消息操作栏 */}
                {m.role === "assistant" && !m.loading && m.content && (
                  <div className="msg-actions">
                    <button className={`msg-action-btn ${copiedIdx === i ? "copied" : ""}`} onClick={() => copyMsg(i, m.content)}>
                      {copiedIdx === i ? <IconCheck size={13} /> : <IconCopy size={13} />}
                      {copiedIdx === i ? "已复制" : "复制"}
                    </button>
                    {i === messages.length - 1 && (
                      <button className="msg-action-btn" onClick={retry}><IconRefresh size={13} /> 重新生成</button>
                    )}
                  </div>
                )}
                {/* Follow-up 建议 chips */}
                {m.role === "assistant" && !m.loading && m.followUps && m.followUps.length > 0 && i === messages.length - 1 && (
                  <div className="followup-chips">
                    {m.followUps.map((q, j) => (
                      <button key={j} className="followup-chip" onClick={() => { setInput(q); taRef.current?.focus(); }}>
                        {q}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="composer-wrap">
        {/* 工作台上下文提示：当前笔记 / 选区已注入对话 */}
        {contextDocId && (
          <div className="ws-context-bar">
            <IconNote size={12} />
            <span>已带入当前笔记作为上下文{selection ? `（含选区 ${selection.length} 字）` : ""}</span>
          </div>
        )}
        <div className="composer">
          <textarea
            ref={taRef}
            rows={1}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); ask(); }
            }}
            placeholder={noDocs ? "请先上传文档或写笔记后再提问…" : "发送消息（Enter 发送 / Shift+Enter 换行）"}
          />
          <button
            className={`tool-toggle ${webSearch ? "on" : ""}`}
            onClick={toggleWebSearch}
            title={webSearch ? "网络搜索：开启（点击关闭）" : "网络搜索：关闭（点击开启）"}
            aria-pressed={webSearch}
          >
            <IconGlobe size={16} />
            <span>联网</span>
          </button>
          {busy ? (
            <button className="send-btn stop" onClick={stop} aria-label="停止生成"><IconStop size={18} /></button>
          ) : (
            <button className="send-btn" onClick={ask} disabled={!input.trim() || noDocs} aria-label="发送"><IconSend size={18} /></button>
          )}
        </div>
        <div className="composer-foot">私人知识库 · 答案基于你的文档生成，请核实重要信息</div>
      </div>

      <DocPreview docId={previewDoc} onClose={() => setPreviewDoc(null)} />
      {notePanel && <NotePanel title={notePanel.title} content={notePanel.content} noteId={notePanel.noteId} onClose={() => setNotePanel(null)} />}
    </div>
  );
}

/** 上下文用量指示条（参考 LobeChat 的 token 计数 UI）。 */
function ContextBar({ tokens, model }: { tokens: number; model: string }) {
  const windows: Record<string, number> = { "deepseek-v4-pro": 1_000_000, "deepseek-v4-flash": 128_000 };
  const window = windows[model] || 128_000;
  const pct = Math.min(100, (tokens / window) * 100);
  const color = pct > 85 ? "var(--danger)" : pct > 70 ? "#d97706" : "#10a37f";
  const label = tokens > 1000 ? `${(tokens / 1000).toFixed(1)}K` : `${tokens}`;
  return (
    <div className="ctx-bar" title={`上下文用量：${tokens} / ${window.toLocaleString()} tokens`}>
      <div className="ctx-bar-track">
        <div className="ctx-bar-fill" style={{ width: `${pct}%`, background: color }} />
      </div>
      <span className="ctx-bar-label" style={{ color }}>{label}</span>
    </div>
  );
}
