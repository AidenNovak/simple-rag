// 极简 API client：所有请求带 JWT，401 跳登录。
const TOKEN_KEY = "kb_token";

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}
export function setToken(t: string) {
  localStorage.setItem(TOKEN_KEY, t);
}
export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
}

async function req(path: string, init: RequestInit = {}): Promise<any> {
  const token = getToken();
  const headers: Record<string, string> = { ...(init.headers as any) };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch(`/api${path}`, { ...init, headers });
  if (res.status === 401) {
    clearToken();
    window.dispatchEvent(new Event("auth:logout"));
    throw new Error("unauthorized");
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error || `HTTP ${res.status}`);
  }
  return res.json();
}

export const api = {
  // auth
  register: (email: string, password: string) =>
    req("/auth/register", { method: "POST", body: JSON.stringify({ email, password }), headers: { "Content-Type": "application/json" } }),
  login: (email: string, password: string) =>
    req("/auth/login", { method: "POST", body: JSON.stringify({ email, password }), headers: { "Content-Type": "application/json" } }),
  me: () => req("/auth/me"),
  setNewapiKey: (apiKey: string) =>
    req("/auth/newapi-key", { method: "POST", body: JSON.stringify({ apiKey }), headers: { "Content-Type": "application/json" } }),
  setChatConfig: (data: { apiKey?: string; baseUrl?: string; chatModel?: string }) =>
    req("/auth/chat-config", { method: "POST", body: JSON.stringify(data), headers: { "Content-Type": "application/json" } }),
  setModels: (chatModel?: string, embeddingModel?: string) =>
    req("/auth/models", { method: "POST", body: JSON.stringify({ chatModel, embeddingModel }), headers: { "Content-Type": "application/json" } }),

  // documents
  listDocs: (status?: string) => req(`/documents${status ? `?status=${status}` : ""}`),
  getDoc: (id: string) => req(`/documents/${id}`),
  upload: (file: File) => {
    const fd = new FormData();
    fd.append("file", file);
    return req("/documents/upload", { method: "POST", body: fd });
  },
  createNote: (title: string, content: string) =>
    req("/documents/note", { method: "POST", body: JSON.stringify({ title, content }), headers: { "Content-Type": "application/json" } }),
  updateNote: (id: string, title: string, content: string) =>
    req(`/documents/${id}`, { method: "PATCH", body: JSON.stringify({ title, content }), headers: { "Content-Type": "application/json" } }),
  deleteDoc: (id: string) => req(`/documents/${id}`, { method: "DELETE" }),
  reingest: (id: string) => req(`/documents/${id}/reingest`, { method: "POST" }),

  // chat
  ask: (question: string, conversationId?: string) =>
    req("/chat/ask", { method: "POST", body: JSON.stringify({ question, conversationId }), headers: { "Content-Type": "application/json" } }),
  listConversations: () => req("/conversations"),
  getMessages: (convoId: string) => req(`/conversations/${convoId}/messages`),
  renameConversation: (id: string, title: string) =>
    req(`/conversations/${id}`, { method: "PATCH", body: JSON.stringify({ title }), headers: { "Content-Type": "application/json" } }),
  setConversationScope: (id: string, docIds: string[] | null) =>
    req(`/conversations/${id}`, { method: "PATCH", body: JSON.stringify({ scopeDocIds: docIds }), headers: { "Content-Type": "application/json" } }),
  deleteConversation: (id: string) => req(`/conversations/${id}`, { method: "DELETE" }),

  // search
  search: (query: string, topK = 10) =>
    req("/search", { method: "POST", body: JSON.stringify({ query, topK }), headers: { "Content-Type": "application/json" } }),

  // mcp tokens —— 给本地 agent（Cursor/Claude Code/Codex）授权检索知识库
  listMcpTokens: () => req("/mcp-tokens"),
  createMcpToken: (label: string) =>
    req("/mcp-tokens", { method: "POST", body: JSON.stringify({ label }), headers: { "Content-Type": "application/json" } }),
  revokeMcpToken: (id: string) => req(`/mcp-tokens/${id}`, { method: "DELETE" }),
};
