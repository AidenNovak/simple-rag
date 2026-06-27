/**
 * ChatPane — 自 screens/Chat.tsx 迁移的 SSE 对话 UI。
 *
 * 改动（相对原 Chat.tsx）：
 *  - Props 仅 { chatModel? }；convoId/scopeDocIds/selection/activeDocId 从 useWorkspace 读
 *  - 删除 notePanel 本地态：引用 chip 点击 → dispatch SET_ACTIVE_DOC（非当前文档）+ scroll 事件
 *  - 发送时 body 带 selection + contextDocId（工作台注入）
 *  - SSE 消费循环 / 150ms 节流 / activities 时间轴 / citations 全部保留（红线不可动）
 */
import { useEffect, useRef, useState } from "react";
import { api, getToken } from "../api.js";
import { IconSend, IconSpinner, IconTool, IconSource, IconCopy, IconCheck, IconRefresh, IconStop, IconDeepSeek, IconGlobe } from "../Icons.js";
import { useToast } from "../components/Toast.js";
import MarkdownRender, { TextNode, type NodeComponentProps } from "markstream-react";
import "markstream-react/index.css";
import "katex/dist/katex.min.css";
import { useWorkspace } from "./WorkspaceStore.js";
import { ScopeDropdown } from "./ScopeDropdown.js";
import { FilePeekPanel } from "./FilePeekPanel.js";
import { ReferenceNotePicker } from "./ReferenceNotePicker.js";
import { ContextRefBar } from "./ContextRefBar.js";
import { useMarkstreamDark } from "../theme/useMarkstreamDark.js";

const INLINE_CITE_RE = /\[(\d{1,3})\]/;
function CitationTextNode(props: NodeComponentProps<{ type: "text"; content: string; center?: boolean }>) {
  const content = props.node?.content ?? "";
  if (props.children || !content || !INLINE_CITE_RE.test(content)) return <TextNode {...props} />;
  const segs = content.split(INLINE_CITE_RE);
  return (
    <span className={"text-node whitespace-pre-wrap break-words" + (props.node.center ? " text-node-center" : "")}>
      {segs.map((s, i) => i % 2 === 1 ? <sup key={i} className="inline-cite">[{s}]</sup> : <span key={i}>{s}</span>)}
    </span>
  );
}
const MARKSTREAM_CUSTOM = { text: CitationTextNode };

function normalizeMath(text: string): string {
  return text
    .replace(/\\\[([\s\S]*?)\\\]/g, (_, math) => `$$${math}$$`)
    .replace(/\\\(([\s\S]*?)\\\)/g, (_, math) => `$${math}$`);
}

interface Citation { n: number; docId: string; docTitle: string; locator: Record<string, string | number> | null; snippet: string; }
interface ToolCall { name: string; args: unknown; resultPreview: string; resultFull?: string; done?: boolean; type?: "tool" | "search" }
interface Activity { id: string; type: "reasoning" | "tool" | "search"; text?: string; tool?: ToolCall; }
interface Msg { role: "user" | "assistant"; content: string; citations?: Citation[]; toolCalls?: ToolCall[]; activities?: Activity[]; loading?: boolean; error?: boolean; followUps?: string[]; stopped?: boolean; reasoning?: string }

const TOOL_LABEL: Record<string, string> = {
  search_knowledge_base: "检索知识库", keyword_search: "关键词检索",
  list_documents: "列出文档", get_document_status: "查询状态",
  create_note: "创建笔记", list_notes: "列出笔记", get_note: "查看笔记",
  update_note: "修改笔记", delete_note: "删除笔记", append_note: "追加笔记",
  set_note_tags: "🏷 设置标签", search_notes_by_tag: "🏷 按标签查",
  save_conversation_as_note: "💾 沉淀对话", search_conversations: "💬 检索对话",
  get_time: "🕐 获取时间", web_search: "🌐 网络搜索", web_scrape: "🌐 网页抓取",
};

interface Props { chatModel?: string | null; }

export function ChatPane({ chatModel }: Props) {
  const toast = useToast();
  const { state, dispatch } = useWorkspace();
  const markstreamDark = useMarkstreamDark();
  const activeConvo = state.convoId;
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [readyCount, setReadyCount] = useState<number | null>(null);
  const [previewDoc, setPreviewDoc] = useState<string | null>(null);
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);
  const [expandedTool, setExpandedTool] = useState<string | null>(null);
  const [contextTokens, setContextTokens] = useState<number | null>(null);
  const [allDocs, setAllDocs] = useState<any[]>([]);
  const [noteTotal, setNoteTotal] = useState<number | null>(null);
  const [allNotes, setAllNotes] = useState<{ id: string; title: string }[]>([]);
  const [pinnedSelection, setPinnedSelection] = useState<string | null>(null);
  const [webSearch, setWebSearch] = useState<boolean>(() => {
    try { return localStorage.getItem("kb.webSearch") === "1"; } catch { return false; }
  });
  const toggleWebSearch = () => {
    setWebSearch((v) => { const next = !v; try { localStorage.setItem("kb.webSearch", next ? "1" : "0"); } catch {}; toast("info", next ? "已开启网络搜索" : "已关闭网络搜索"); return next; });
  };

  // ===== 空状态引导建议（借鉴 OpenKnowledge rotating suggestion）=====
  // 选中笔记后，空状态展示 3 条可点击的提问建议。
  const PLACEHOLDER_SUGGESTIONS = [
    "总结这篇笔记的三个要点",
    "对比一下这两种方案的优劣",
    "帮我追加深度分析的段落",
    "我之前问过关于这个的内容吗？",
    "把这段对话沉淀成笔记",
  ];

  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const loadedConvoRef = useRef<string | null>(null);
  const lastQuestionRef = useRef<string>("");

  // 选区变化时同步 pin（供下条消息使用）
  useEffect(() => {
    if (state.selection) setPinnedSelection(state.selection.text);
  }, [state.selection]);

  // 加载会话历史
  useEffect(() => {
    if (!activeConvo) { setMessages([]); loadedConvoRef.current = null; return; }
    if (loadedConvoRef.current === activeConvo) return;
    if (abortRef.current) { abortRef.current.abort(); abortRef.current = null; setBusy(false); }
    loadedConvoRef.current = activeConvo;
    api.getMessages(activeConvo).then((r) => {
      setMessages((r.messages || []).filter((m: any) => m.role === "user" || m.role === "assistant").map((m: any) => ({
        role: m.role, content: m.content, citations: m.citations,
        toolCalls: ((m.usage && m.usage.toolCalls) || []).map((t: any) => ({ ...t, done: true })),
      })));
    }).catch(() => setMessages([]));
  }, [activeConvo]);

  useEffect(() => {
    api.listDocs().then((r) => {
      const docs = r.documents || [];
      const ready = docs.filter((d: any) => d.status === "ready");
      const notes = docs.filter((d: any) => d.kind === "note");
      setReadyCount(ready.length);
      setNoteTotal(notes.length);
      setAllDocs(ready);
      setAllNotes(notes.map((d: any) => ({ id: d.id, title: d.title })));
    }).catch(() => {});
  }, [messages.length]);

  // 自动滚动
  const autoStick = useRef(true);
  const scrollRaf = useRef<number | null>(null);
  useEffect(() => {
    const el = scrollRef.current; if (!el) return;
    const onScroll = () => { autoStick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120; };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);
  useEffect(() => {
    if (!autoStick.current) return;
    if (scrollRaf.current) cancelAnimationFrame(scrollRaf.current);
    scrollRaf.current = requestAnimationFrame(() => { const el = scrollRef.current; if (el) el.scrollTop = el.scrollHeight; });
  }, [messages]);

  useEffect(() => {
    const ta = taRef.current; if (!ta) return;
    ta.style.height = "auto"; ta.style.height = Math.min(ta.scrollHeight, 200) + "px";
  }, [input]);

  const onConvoCreated = (id: string, title: string) => {
    dispatch({ type: "SET_CONVO", payload: id });
    window.dispatchEvent(new CustomEvent("ws:convo-created", { detail: { id, title } }));
  };

  const runAsk = async (question: string) => {
    if (!question.trim() || busy) return;
    lastQuestionRef.current = question;
    setInput("");
    setBusy(true);
    setMessages((m) => [...m, { role: "user", content: question }, { role: "assistant", content: "", loading: true }]);
    const ac = new AbortController(); abortRef.current = ac;
    let flushTimer: ReturnType<typeof setInterval> | null = null;

    try {
      const selText = pinnedSelection || state.selection?.text || undefined;
      const ctxIds = state.contextDocIds;
      const firstCtx = ctxIds[0];
      const selection = selText && firstCtx
        ? { docId: firstCtx, text: selText, start: state.selection?.start, end: state.selection?.end }
        : undefined;
      const res = await fetch(`/api/chat/stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({
          question, conversationId: activeConvo || undefined, webSearch,
          ...(selection ? { selection } : {}),
          ...(ctxIds.length > 0 ? { contextDocIds: ctxIds } : {}),
        }),
        signal: ac.signal,
      });
      if (!res.ok || !res.body) { const e = await res.json().catch(() => ({ error: `HTTP ${res.status}` })); throw new Error(e.error); }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = ""; let answerAcc = "";
      const activities: Activity[] = []; let actIdSeq = 0; let reasoningNewRound = false;
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
        const frames = buf.split("\n\n"); buf = frames.pop() || "";
        for (const frame of frames) {
          const lines = frame.split("\n"); let evtName = "message"; let dataLine = "";
          for (const line of lines) { if (line.startsWith("event:")) evtName = line.slice(6).trim(); else if (line.startsWith("data:")) dataLine = line.slice(5).trim(); }
          if (!dataLine || dataLine.startsWith(":")) continue;
          let data: any; try { data = JSON.parse(dataLine); } catch { continue; }
          switch (evtName) {
            case "citations":
              setMessages((m) => { const c = [...m]; const last = { ...c[c.length - 1] }; last.citations = data; c[c.length - 1] = last; return c; });
              break;
            case "toolCalls":
              setMessages((m) => {
                const c = [...m]; const last = { ...c[c.length - 1] };
                const newTools = data.map((t: any) => ({ ...t, done: true }));
                last.toolCalls = [...(last.toolCalls || []), ...newTools];
                for (const t of newTools) {
                  const isSearch = t.name === "web_search" || t.name === "web_scrape";
                  activities.push({ id: `act-${actIdSeq++}`, type: isSearch ? "search" : "tool", tool: t });
                }
                last.activities = activities.map((a) => ({ ...a }));
                c[c.length - 1] = last; return c;
              });
              reasoningNewRound = true;
              break;
            case "reasoning":
              setMessages((m) => {
                const c = [...m]; const last = { ...c[c.length - 1] };
                const lastAct = activities[activities.length - 1];
                if (!reasoningNewRound && lastAct && lastAct.type === "reasoning") {
                  lastAct.text = (lastAct.text || "") + (data.content || "");
                } else {
                  activities.push({ id: `act-${actIdSeq++}`, type: "reasoning", text: data.content || "" });
                  reasoningNewRound = false;
                }
                const prevReasoning = last.reasoning || "";
                const sep = (reasoningNewRound && prevReasoning.length > 0) ? "\n\n---\n\n" : "";
                last.reasoning = prevReasoning + sep + (data.content || "");
                last.activities = activities.map((a) => ({ ...a }));
                c[c.length - 1] = last; return c;
              });
              break;
            case "error":
              throw new Error(data.error || "stream error");
            case "doc_patch":
              dispatch({ type: "SET_PENDING_PATCH", payload: { docId: data.docId, title: data.title, content: data.content, previousContent: data.previousContent } });
              break;
            case "done":
              clearInterval(flushTimer); flushToDOM();
              if (!activeConvo && data.conversationId) onConvoCreated(data.conversationId, question.slice(0, 40));
              if (data.usage?.prompt_tokens) setContextTokens(data.usage.prompt_tokens);
              setMessages((m) => {
                const c = [...m];
                c[c.length - 1] = { ...c[c.length - 1], content: answerAcc || (c[c.length-1] as any).content || "", loading: false, followUps: data.followUps || [], activities: activities.map((a) => ({ ...a })), toolCalls: (c[c.length-1] as any).toolCalls };
                return c;
              });
              break;
            default:
              answerAcc += data.delta || "";
              reasoningNewRound = true;
          }
        }
      }
      // 发送成功后清空选区
      if (pinnedSelection || state.selection) { setPinnedSelection(null); dispatch({ type: "CLEAR_SELECTION" }); }
    } catch (e) {
      if (flushTimer) { clearInterval(flushTimer); }
      const aborted = (e as any).name === "AbortError";
      const isNetworkError = (e as any).message?.includes("network") || (e as any).message?.includes("fetch") || (e as Error).message === "aborted";
      setMessages((m) => {
        const copy = [...m]; const last = copy[copy.length - 1];
        if (aborted || isNetworkError) { copy[copy.length - 1] = { ...last, loading: false, stopped: true }; }
        else { const existing = last.content || ""; const errMsg = existing ? "\n\n⚠️ " + (e as Error).message : `⚠️ ${(e as Error).message}`; copy[copy.length - 1] = { ...last, content: existing + errMsg, loading: false, error: true }; }
        return copy;
      });
    } finally {
      if (flushTimer) clearInterval(flushTimer);
      setBusy(false); abortRef.current = null;
    }
  };

  const ask = () => runAsk(input.trim());
  const stop = () => abortRef.current?.abort();
  const retry = () => {
    const lastUser = [...messages].reverse().find((m) => m.role === "user");
    if (!lastUser) return;
    setMessages((m) => { const c = m.slice(); if (c.length && c[c.length - 1].role === "assistant") c.pop(); return c; });
    runAsk(lastQuestionRef.current);
  };
  const copyMsg = async (i: number, content: string) => {
    try { await navigator.clipboard.writeText(content); setCopiedIdx(i); toast("success", "已复制"); setTimeout(() => setCopiedIdx(null), 2000); } catch { toast("error", "复制失败"); }
  };

  // 引用 chip：当前文档 → scroll 到片段；其它笔记 → 打开为活动文档再 scroll；文件 → DocPreview overlay
  const onCitationClick = async (c: Citation) => {
    if (c.docId === state.activeDocId) {
      if (c.snippet) window.dispatchEvent(new CustomEvent("workspace:scroll-to", { detail: c.snippet }));
      return;
    }
    try {
      const r = await api.getDoc(c.docId);
      const doc = r.document;
      if (doc.kind === "note") {
        dispatch({ type: "SET_ACTIVE_DOC", payload: { id: doc.id, title: doc.title, content: doc.contentMd || "", kind: "note" } });
        setTimeout(() => window.dispatchEvent(new CustomEvent("workspace:scroll-to", { detail: c.snippet })), 120);
      } else {
        setPreviewDoc(c.docId);
      }
    } catch {
      setPreviewDoc(c.docId);
    }
  };

  const toggleDocInScope = (docId: string) => {
    const prev = state.scopeDocIds; const current = prev || allDocs.map((d) => d.id);
    const next = current.includes(docId) ? current.filter((id) => id !== docId) : [...current, docId];
    const result = next.length === allDocs.length ? null : next;
    dispatch({ type: "SET_SCOPE", payload: result });
    if (activeConvo) api.setConversationScope(activeConvo, result).catch(() => {});
  };

  const isEmpty = messages.length === 0;
  // noDocs：仅当 listDocs 总数为 0 才禁用发送（有 pending 笔记可问）
  const noDocs = noteTotal !== null && noteTotal === 0 && allDocs.length === 0;
  // 参考笔记：全部 note（含 pending），非仅 ready
  const refNotes = allNotes;
  const lastMsg = messages[messages.length - 1];
  const isThinking = busy && lastMsg?.role === "assistant" && !lastMsg.content;

  return (
    <div className="ws-chat" data-testid="chat-pane">
      <div className="ws-chat-header">
        <div className="row gap-3" style={{ flex: 1 }}>
          {allDocs.length > 0 && (
            <ScopeDropdown
              docs={allDocs}
              scopeDocIds={state.scopeDocIds}
              onToggleDoc={toggleDocInScope}
              onSelectAll={() => {
                dispatch({ type: "SET_SCOPE", payload: null });
                if (activeConvo) api.setConversationScope(activeConvo, null).catch(() => {});
              }}
            />
          )}
          {chatModel && (
            <div className="row muted text-caption gap-2">
              <IconDeepSeek size={12} /> {chatModel}
            </div>
          )}
          {noteTotal !== null && readyCount !== null && (
            <span className="muted ws-doc-count text-caption">
              {noteTotal === readyCount ? `${readyCount} 篇可检索` : `${noteTotal} 笔记 · ${readyCount} 可检索`}
            </span>
          )}
        </div>
      </div>

      <div className="chat-scroll" ref={scrollRef} style={{ flex: 1 }}>
        {isEmpty ? (
          <div className="chat-empty ws-chat-empty">
            <ReferenceNotePicker
              notes={refNotes}
              selectedIds={state.contextDocIds}
              onToggle={(id, title) => dispatch({ type: "TOGGLE_CONTEXT_DOC", payload: { id, title } })}
            />
            {!noDocs && state.contextDocIds.length > 0 && (
              <div className="empty-suggestions">
                <div className="empty-suggestions-label">可以问我</div>
                <div className="empty-suggestions-row">
                  {PLACEHOLDER_SUGGESTIONS.slice(0, 3).map((s) => (
                    <button key={s} className="followup-chip" onClick={() => { setInput(s); taRef.current?.focus(); }}>{s}</button>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="chat-stream">
            {messages.map((m, i) => (
              <div key={i} className={`msg ${m.role}${m.loading ? " loading" : ""}`}>
                <div className="role-label">
                  {m.role === "user" ? "你" : (
                    <span className="agent-role">
                      <span className={`agent-avatar${m.loading ? " live" : ""}`}><IconDeepSeek size={13} /></span>
                      <span className="role-name">知识库助手</span>
                    </span>
                  )}
                </div>
                {m.role === "assistant" && (() => {
                  let acts = m.activities;
                  if ((!acts || acts.length === 0) && m.toolCalls && m.toolCalls.length > 0) {
                    acts = m.toolCalls.map((t, j) => ({ id: `hist-${i}-${j}`, type: (t.name === "web_search" || t.name === "web_scrape") ? "search" as const : "tool" as const, tool: t }));
                  }
                  if (!acts || acts.length === 0) {
                    if (m.loading && !m.content) {
                      return (<div className="activity-timeline"><div className="activity-node reasoning"><div className="activity-card reasoning"><div className="activity-head"><IconSpinner size={13} className="spin-small" /> 正在思考…</div></div></div></div>);
                    }
                    return null;
                  }
                  if (m.loading) {
                    return (
                      <div className="activity-timeline">
                        {acts.map((a, j) => {
                          const key = `${i}-${a.id}`; const isReasoning = a.type === "reasoning"; const isSearch = a.type === "search"; const t = a.tool;
                          const argStr = t?.args ? (typeof t.args === "object" ? JSON.stringify(t.args).slice(0, 100) : String(t.args).slice(0, 100)) : "";
                          const label = t ? (TOOL_LABEL[t.name] || t.name) : "思考";
                          return (
                            <div key={j} className={`activity-node ${a.type}`}>
                              <div className={`activity-card ${a.type}`}>
                                <div className="activity-head" style={{ cursor: (!isReasoning && t?.resultFull) ? "pointer" : "default" }} onClick={() => (!isReasoning && t?.resultFull) && setExpandedTool(expandedTool === key ? null : key)}>
                                  {isReasoning ? <span className="activity-icon">💭</span> : isSearch ? <IconGlobe size={13} /> : <IconTool size={13} />}
                                  <span className="activity-title">{label}</span>
                                  {!isReasoning && argStr && <span className="muted activity-sub">{argStr}</span>}
                                  {!isReasoning && t?.done && <IconCheck size={11} className="activity-check" />}
                                </div>
                                {isReasoning && a.text && (<div className="activity-reasoning">{a.text}</div>)}
                                {!isReasoning && expandedTool === key && t?.resultFull && (<div className="activity-detail">{t.resultFull}</div>)}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    );
                  }
                  const stepCount = acts.length; const searchCount = acts.filter((a) => a.type === "search").length;
                  return (
                    <details className="activity-summary">
                      <summary>📋 推理过程 · {stepCount} 步{searchCount > 0 ? `（含 ${searchCount} 次联网搜索）` : ""}</summary>
                      <div className="activity-timeline compact">
                        {acts.map((a, j) => {
                          const key = `${i}-${a.id}`; const isReasoning = a.type === "reasoning"; const isSearch = a.type === "search"; const t = a.tool;
                          const argStr = t?.args ? (typeof t.args === "object" ? JSON.stringify(t.args).slice(0, 100) : String(t.args).slice(0, 100)) : "";
                          const label = t ? (TOOL_LABEL[t.name] || t.name) : "思考";
                          return (
                            <div key={j} className={`activity-node ${a.type}`}>
                              <div className={`activity-card ${a.type}`}>
                                <div className="activity-head" style={{ cursor: (!isReasoning && t?.resultFull) ? "pointer" : "default" }} onClick={() => (!isReasoning && t?.resultFull) && setExpandedTool(expandedTool === key ? null : key)}>
                                  {isReasoning ? <span className="activity-icon">💭</span> : isSearch ? <IconGlobe size={13} /> : <IconTool size={13} />}
                                  <span className="activity-title">{label}</span>
                                  {!isReasoning && argStr && <span className="muted activity-sub">{argStr}</span>}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </details>
                  );
                })()}
                <div className={`bubble ${m.loading && !m.content ? "typing-cursor" : ""}${m.loading && m.content ? " agent-flashing" : ""}`}>
                  {m.role === "assistant" ? (
                    <MarkdownRender content={normalizeMath(m.content)} final={!m.loading} fade={false} dark={markstreamDark} customComponents={MARKSTREAM_CUSTOM} />
                  ) : m.content}
                </div>

                {m.citations && m.citations.length > 0 && (
                  <div className="citations">
                    <div className="cite-label"><IconSource size={12} /> 引用来源</div>
                    {m.citations.map((c) => (
                      <span key={c.n} className="cite-chip" title={c.snippet} onClick={() => onCitationClick(c)} role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === "Enter") onCitationClick(c); }}>
                        <span className="cite-n">[{c.n}]</span>
                        <span className="cite-title">{c.docTitle}{c.locator && " · " + Object.entries(c.locator).map(([k, v]) => `${k}=${v}`).join(" ")}</span>
                      </span>
                    ))}
                  </div>
                )}

                {m.role === "assistant" && !m.loading && m.content && (
                  <div className="msg-actions">
                    <button className={`msg-action-btn ${copiedIdx === i ? "copied" : ""}`} onClick={() => copyMsg(i, m.content)}>{copiedIdx === i ? <IconCheck size={13} /> : <IconCopy size={13} />}{copiedIdx === i ? "已复制" : "复制"}</button>
                    {i === messages.length - 1 && <button className="msg-action-btn" onClick={retry}><IconRefresh size={13} /> 重新生成</button>}
                  </div>
                )}
                {m.role === "assistant" && !m.loading && m.followUps && m.followUps.length > 0 && i === messages.length - 1 && (
                  <div className="followup-chips">
                    {m.followUps.map((q, j) => (<button key={j} className="followup-chip" onClick={() => { setInput(q); taRef.current?.focus(); }}>{q}</button>))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="ws-composer-stack" data-testid="composer-stack">
        {state.contextDocIds.length > 0 && (
          <ContextRefBar
            selectedIds={state.contextDocIds}
            titles={state.contextDocTitles}
            notes={refNotes}
            onToggle={(id, title) => dispatch({ type: "TOGGLE_CONTEXT_DOC", payload: { id, title } })}
            onClear={() => dispatch({ type: "CLEAR_CONTEXT_DOC" })}
          />
        )}
        {(pinnedSelection || state.selection) && (
          <div className="ws-context-bar">
            <IconSource size={12} />
            <span>已带入选区 {(pinnedSelection || state.selection?.text || "").length} 字</span>
            <button className="ws-context-clear" onClick={() => { setPinnedSelection(null); dispatch({ type: "CLEAR_SELECTION" }); }}>×</button>
          </div>
        )}
        <div className="composer ws-composer">
          <textarea ref={taRef} rows={1} value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); ask(); } }} placeholder={state.contextDocIds.length > 0 ? `关于选中的 ${state.contextDocIds.length} 篇笔记提问…` : noDocs ? "先新建笔记或上传文档…" : "请先选择参考笔记"} />
          <button className={`tool-toggle ${webSearch ? "on" : ""}`} onClick={toggleWebSearch} title={webSearch ? "网络搜索：开启" : "网络搜索：关闭"} aria-pressed={webSearch}><IconGlobe size={16} /><span>联网</span></button>
          {busy ? <button className="send-btn stop" onClick={stop} aria-label="停止生成"><IconStop size={18} /></button> : <button className="send-btn" onClick={ask} disabled={!input.trim() || noDocs || state.contextDocIds.length === 0} aria-label="发送"><IconSend size={18} /></button>}
        </div>
      </div>

      <FilePeekPanel docId={previewDoc} onClose={() => setPreviewDoc(null)} />
    </div>
  );
}
