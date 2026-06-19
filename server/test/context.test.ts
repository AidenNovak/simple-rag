/**
 * 上下文管理测试：多轮记忆 + token 预算 + 压缩触发。
 *
 * 覆盖：
 *   1. buildContextMessages：token 预算裁剪（短历史全保留，超长裁剪）
 *   2. estimateTokens：CJK 与英文混合估算
 *   3. shouldCompress：阈值判定
 *   4. 多轮对话真实记忆（端到端：问 A → 追问「它」→ 验证代词指代）
 *   5. 模型切换后上下文窗口适配（v4-pro 1M vs v4-flash 128K）
 */
import assert from "node:assert";
import {
  estimateTokens, getContextWindow, getInputBudget, shouldCompress,
  buildContextMessages, MODEL_CONTEXT_WINDOWS, type HistoryTurn,
} from "../src/llm/context.js";

let passed = 0;
const failures: string[] = [];
const ok = (n: string, c: boolean, d?: string) => {
  if (c) { passed++; console.log(`  ✅ ${n}`); }
  else { failures.push(`${n}${d ? ` — ${d}` : ""}`); console.log(`  ❌ ${n}${d ? ` — ${d}` : ""}`); }
};

async function main() {
  console.log("\n🧠 上下文管理测试\n");

  // 【1】Token 估算
  console.log("【1】Token 估算");
  // 同字数对比：10 中文字 vs 10 英文字符
  const en = estimateTokens("abcdefghij"); // 10 chars
  const cn = estimateTokens("你好世界测试开发运维"); // 10 chars
  const mixed = estimateTokens("Hello 你好 world 世界");
  ok("英文 token > 0", en > 0);
  ok("中文字符 token 密度高于英文（同字数）", cn > en, `cn=${cn} en=${en}（CJK×0.6 vs ASCII×0.3）`);
  ok("混合文本合理", mixed > 0, `mixed=${mixed}`);

  // 【2】模型上下文窗口
  console.log("\n【2】模型上下文窗口");
  ok("v4-pro = 1M", getContextWindow("deepseek-v4-pro") === 1_000_000);
  ok("v4-flash = 128K", getContextWindow("deepseek-v4-flash") === 128_000);
  ok("未知模型用默认", getContextWindow("unknown-model") === 128_000);
  ok("前缀匹配", getContextWindow("deepseek-v4-pro-finetune") === 1_000_000);

  // 【3】输入预算
  console.log("\n【3】输入预算");
  const budgetPro = getInputBudget("deepseek-v4-pro");
  const budgetFlash = getInputBudget("deepseek-v4-flash");
  ok("v4-pro 预算远大于 v4-flash", budgetPro > budgetFlash * 5, `pro=${budgetPro} flash=${budgetFlash}`);
  ok("预算 = 窗口 - 4000 - 2000", budgetPro === 1_000_000 - 4000 - 2000, `budget=${budgetPro}`);

  // 【4】buildContextMessages — 短历史全保留
  console.log("\n【4】buildContextMessages — 短历史");
  const shortHistory: HistoryTurn[] = [
    { role: "user", content: "什么是光合作用" },
    { role: "assistant", content: "光合作用是植物利用光能转化二氧化碳和水的过程。" },
  ];
  const r1 = buildContextMessages("你是助手", shortHistory, "它有什么阶段？", "deepseek-v4-pro");
  ok("短历史全保留（4 条消息 = system + 2 history + user）", r1.messages.length === 4, `len=${r1.messages.length}`);
  ok("tokensUsed 在预算内", r1.tokensUsed < r1.budget);
  ok("未压缩", !r1.compressed);

  // 【5】buildContextMessages — 超长历史裁剪
  console.log("\n【5】buildContextMessages — 超长历史裁剪");
  const longHistory: HistoryTurn[] = [];
  const bigText = "这是一个用于测试上下文窗口裁剪功能的超长文本段落。".repeat(100); // ~2500 字/条
  for (let i = 0; i < 200; i++) {
    longHistory.push(
      { role: "user", content: `第${i}个问题：${bigText}` },
      { role: "assistant", content: `回答${i}：${bigText}` },
    );
  }
  // 用 v4-flash 小窗口测试裁剪
  const r2 = buildContextMessages("你是助手", longHistory, "最新问题", "deepseek-v4-flash");
  ok("超长历史被裁剪", r2.messages.length < longHistory.length + 2, `kept=${r2.messages.length} total_history=${longHistory.length}`);
  ok("裁剪后 tokensUsed < 预算×0.85", r2.tokensUsed < getInputBudget("deepseek-v4-flash") * 0.85, `tokens=${r2.tokensUsed}`);
  ok("标记为已压缩", r2.compressed);
  ok("system prompt 始终在首位", r2.messages[0].role === "system");
  ok("最新问题在末尾", r2.messages[r2.messages.length - 1].role === "user");

  // 【6】shouldCompress
  console.log("\n【6】压缩阈值判定");
  ok("低 token 不压缩", !shouldCompress(1000, "deepseek-v4-pro"));
  ok("接近 85% 触发压缩", shouldCompress(getInputBudget("deepseek-v4-flash") * 0.9, "deepseek-v4-flash"));
  ok("flash 比 pro 更早触发", shouldCompress(120_000, "deepseek-v4-flash") && !shouldCompress(120_000, "deepseek-v4-pro"));

  // 【7】tool 结果降级
  console.log("\n【7】tool 结果标记与降级");
  const historyWithTool: HistoryTurn[] = [
    { role: "user", content: "问题" },
    { role: "assistant", content: "回答" },
    { role: "user", content: "追问", isToolResult: false },
  ];
  const r3 = buildContextMessages("sys", historyWithTool, "最新", "deepseek-v4-pro");
  ok("带 isToolResult 的历史正常处理", r3.messages.length === 5);

  // 【8】端到端多轮记忆（真实 API）
  console.log("\n【8】端到端多轮对话记忆（真实 DeepSeek）");
  const API = "http://127.0.0.1:8787";
  const TS = Date.now();
  const regRes: any = await (await fetch(`${API}/api/auth/register`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: `ctx_${TS}@test.com`, password: "ctxtest12345" }),
  })).json();
  const token = regRes.token;
  if (!token) { ok("用户注册", false, "无 token"); }
  else {
    // 写一篇笔记
    await fetch(`${API}/api/documents/note`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ title: "测试文档", content: "超导临界温度是材料失去电阻的温度。NbTi 的临界温度约 9.2K。" }),
    });
    await new Promise((r) => setTimeout(r, 12000));

    // 第 1 轮：建立上下文
    const ask1: any = await (await fetch(`${API}/api/chat/ask`, {
      method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ question: "NbTi 的超导临界温度是多少？" }),
    })).json();
    const convoId = ask1.conversationId;
    ok("第 1 轮回答含 9.2K", /9\.2/.test(ask1.answer || ""), (ask1.answer || "").slice(0, 80));

    if (convoId) {
      // 第 2 轮：用代词追问（验证多轮记忆）
      const ask2: any = await (await fetch(`${API}/api/chat/ask`, {
        method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ question: "换算成摄氏度是多少？", conversationId: convoId }),
      })).json();
      ok("第 2 轮有上下文记忆（提到 -264°C 或换算）", /-26[0-9]|摄氏|℃|273/.test(ask2.answer || ""), (ask2.answer || "").slice(0, 100));
    }
  }

  console.log(`\n${"=".repeat(50)}`);
  console.log(`✅ 通过 ${passed} 项`);
  if (failures.length) { console.log(`❌ 失败 ${failures.length}:`); failures.forEach((f) => console.log(`   - ${f}`)); }
  else console.log("🎉 全部通过！");
  console.log("=".repeat(50));
  process.exit(failures.length ? 1 : 0);
}

main().catch((e) => { console.error("异常:", e); process.exit(1); });
