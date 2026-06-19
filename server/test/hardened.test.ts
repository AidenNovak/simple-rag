/**
 * 安全 + 容灾 + 功能难度综合测试。
 *
 * 覆盖审计发现的所有 P0/P1 修复点：
 *   安全：多租户隔离、IDOR 防护、越权访问
 *   容灾：限流、错误码、无效输入
 *   功能：会话删除/重命名、笔记编辑重摄入、多轮上下文
 */
const API = "http://127.0.0.1:8787";
let passed = 0;
const failures: string[] = [];
const ok = (n: string, c: boolean, d?: string) => {
  if (c) { passed++; console.log(`  ✅ ${n}`); }
  else { failures.push(`${n}${d ? ` — ${d}` : ""}`); console.log(`  ❌ ${n}${d ? ` — ${d}` : ""}`); }
};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function reg(email: string) {
  const r = await fetch(`${API}/api/auth/register`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: "hardened12345" }),
  });
  return { ok: r.ok, ...(await r.json()) };
}
async function authReq(token: string, path: string, opts: RequestInit = {}) {
  return fetch(`${API}/api${path}`, { ...opts, headers: { ...opts.headers, Authorization: `Bearer ${token}` } });
}

async function main() {
  console.log("\n🛡️ 安全 + 容灾 + 功能难度测试\n");
  const TS = Date.now();

  // ===== 安全 =====
  console.log("【安全】多租户隔离");

  // 注册两用户
  const uA: any = await reg(`sec_a_${TS}@test.com`);
  const uB: any = await reg(`sec_b_${TS}@test.com`);
  ok("用户 A 注册", !!uA.token);
  ok("用户 B 注册", !!uB.token);

  // A 创建笔记
  const noteA: any = await (await authReq(uA.token, "/documents/note", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title: "A的私密笔记", content: "这是用户A的机密内容，B不应该看到。关键词：原子弹配方。" }),
  })).json();
  const docAId = noteA.document?.id;
  ok("A 创建笔记", !!docAId);

  // B 尝试读 A 的文档（IDOR 测试）
  const steal = await authReq(uB.token, `/documents/${docAId}`);
  ok("B 无法读 A 的文档（404）", steal.status === 404, `status=${steal.status}`);

  // B 尝试删 A 的文档
  const delAttempt = await authReq(uB.token, `/documents/${docAId}`, { method: "DELETE" });
  ok("B 无法删 A 的文档（404）", delAttempt.status === 404, `status=${delAttempt.status}`);

  // B 尝试 PATCH A 的笔记
  const patchAttempt = await authReq(uB.token, `/documents/${docAId}`, {
    method: "PATCH", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content: "被篡改" }),
  });
  ok("B 无法修改 A 的文档（404）", patchAttempt.status === 404);

  // B 列表不含 A 的文档
  const bDocs: any = await (await authReq(uB.token, "/documents")).json();
  ok("B 文档列表不含 A 的笔记", !bDocs.documents?.some((d: any) => d.id === docAId));

  // 无 token 访问
  const noAuth = await fetch(`${API}/api/documents`);
  ok("无 token 返回 401", noAuth.status === 401);

  // 伪造 token
  const fakeToken = await fetch(`${API}/api/documents`, { headers: { Authorization: "Bearer fake-token-xxx" } });
  ok("伪造 token 返回 401", fakeToken.status === 401);

  // ===== 容灾 =====
  console.log("\n【容灾】输入验证 + 错误处理");

  // 注册：弱密码
  const weakPass: any = await (await fetch(`${API}/api/auth/register`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: `weak_${TS}@test.com`, password: "123" }),
  })).json();
  ok("弱密码注册被拒（400）", !!weakPass.error);

  // 注册：无效邮箱
  const badEmail: any = await (await fetch(`${API}/api/auth/register`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "not-an-email", password: "validpass1" }),
  })).json();
  ok("无效邮箱被拒（400）", !!badEmail.error);

  // 重复注册
  const dup: any = await reg(`sec_a_${TS}@test.com`);
  ok("重复邮箱注册被拒（409）", dup.error && dup.ok === false);

  // 无效 UUID 查文档
  const badUuid = await authReq(uA.token, "/documents/not-a-uuid");
  ok("无效 UUID 返回错误（非 200）", badUuid.status >= 400, `status=${badUuid.status}`);

  // chat 空问题
  const emptyQ = await authReq(uA.token, "/chat/ask", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question: "" }),
  });
  ok("空问题返回 400", emptyQ.status === 400);

  // 不存在的会话 ID 删除
  const delFakeConvo = await authReq(uA.token, "/conversations/00000000-0000-0000-0000-000000000000", { method: "DELETE" });
  ok("删除不存在会话返回 404", delFakeConvo.status === 404);

  // ===== 功能：会话管理 =====
  console.log("\n【功能】会话删除 / 重命名");

  // 创建会话
  const convo: any = await (await authReq(uA.token, "/conversations", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title: "测试会话" }),
  })).json();
  const convoId = convo.conversation?.id;
  ok("创建会话", !!convoId);

  // 重命名
  const renamed: any = await (await authReq(uA.token, `/conversations/${convoId}`, {
    method: "PATCH", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title: "重命名后的会话" }),
  })).json();
  ok("重命名会话", renamed.conversation?.title === "重命名后的会话");

  // B 不能操作 A 的会话
  const bRename = await authReq(uB.token, `/conversations/${convoId}`, {
    method: "PATCH", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title: "hacked" }),
  });
  ok("B 不能重命名 A 的会话（404）", bRename.status === 404);

  // 删除会话
  const deleted = await authReq(uA.token, `/conversations/${convoId}`, { method: "DELETE" });
  ok("删除会话成功", deleted.status === 200);

  // 确认已删
  const afterDel: any = await (await authReq(uA.token, "/conversations")).json();
  ok("会话列表不含已删会话", !afterDel.conversations?.some((c: any) => c.id === convoId));

  // ===== 功能：笔记编辑重摄入 =====
  console.log("\n【功能】笔记编辑 → 重新摄入");

  // 等 A 的笔记摄入完成
  let ready = false;
  for (let i = 0; i < 30; i++) {
    const d: any = await (await authReq(uA.token, `/documents/${docAId}`)).json();
    if (d.document?.status === "ready") { ready = true; break; }
    if (d.document?.status === "failed") break;
    await sleep(2000);
  }
  ok("A 笔记初次摄入完成", ready);

  // 编辑笔记
  const edited: any = await (await authReq(uA.token, `/documents/${docAId}`, {
    method: "PATCH", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title: "A的私密笔记", content: "更新后的内容：中子星是恒星坍缩的致密残骸，密度极高。" }),
  })).json();
  ok("笔记编辑成功", edited.ok !== false);

  // 等重新摄入
  let reReady = false;
  for (let i = 0; i < 30; i++) {
    const d: any = await (await authReq(uA.token, `/documents/${docAId}`)).json();
    if (d.document?.status === "ready") { reReady = true; break; }
    await sleep(2000);
  }
  ok("编辑后重新摄入完成", reReady);

  // 问答验证新内容生效
  const qa: any = await (await authReq(uA.token, "/chat/ask", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question: "中子星是什么？" }),
  })).json();
  ok("编辑后问答命中新内容", /中子星|恒星|坍缩|致密/.test(qa.answer || ""), (qa.answer || "").slice(0, 80));

  // ===== 多轮上下文 =====
  console.log("\n【功能】多轮上下文记忆");
  const q1: any = await (await authReq(uA.token, "/chat/ask", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question: "中子星的密度大约是多少？" }),
  })).json();
  const cid = q1.conversationId;
  if (cid) {
    const q2: any = await (await authReq(uA.token, "/chat/ask", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question: "它和黑洞有什么区别？", conversationId: cid }),
    })).json();
    ok("第 2 轮理解「它」指中子星", /中子星|黑洞|坍缩|事件视界|史瓦西/.test(q2.answer || ""), (q2.answer || "").slice(0, 80));
  }

  console.log(`\n${"=".repeat(50)}`);
  console.log(`✅ 通过 ${passed} 项`);
  if (failures.length) { console.log(`❌ 失败 ${failures.length}:`); failures.forEach((f) => console.log(`   - ${f}`)); }
  else console.log("🎉 全部通过！");
  console.log("=".repeat(50));
  process.exit(failures.length ? 1 : 0);
}

main().catch((e) => { console.error("异常:", e); process.exit(1); });
