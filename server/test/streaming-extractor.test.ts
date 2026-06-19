/**
 * StreamingAnswerExtractor 单元测试。
 *
 * 覆盖：普通文本、JSON 转义（\n \" \\ \/ \t \r \b \f \uXXXX）、
 *      片段切在转义序列中间、片段切在 "answer" key 中间、
 *      额外字段在前、value 为非字符串（放弃）。
 */
import assert from "node:assert";
import { StreamingAnswerExtractor } from "../src/rag/agent.js";

let passed = 0;
const failures: string[] = [];
const ok = (n: string, c: boolean, d?: string) => {
  if (c) { passed++; console.log(`  ✅ ${n}`); }
  else { failures.push(`${n}${d ? ` — ${d}` : ""}`); console.log(`  ❌ ${n}${d ? ` — ${d}` : ""}`); }
};

/** 把完整 JSON arguments 按指定切片大小喂给提取器，返回拼接后的输出。 */
function feedInSlices(json: string, sliceSize: number): string {
  const ext = new StreamingAnswerExtractor();
  let out = "";
  for (let i = 0; i < json.length; i += sliceSize) {
    out += ext.feed(json.slice(i, i + sliceSize));
  }
  return out;
}

async function main() {
  console.log("\n🌊 StreamingAnswerExtractor 测试\n");

  // 【1】最简：{"answer":"你好"}
  console.log("【1】最简文本");
  {
    const ext = new StreamingAnswerExtractor();
    let out = "";
    out += ext.feed('{"answer":"');
    out += ext.feed('你好');
    out += ext.feed('"}');
    ok("最简文本一次性", out === "你好", `got ${JSON.stringify(out)}`);
  }

  // 【2】逐字符喂入
  console.log("【2】逐字符喂入");
  {
    const json = '{"answer":"Hello World"}';
    const out = feedInSlices(json, 1);
    ok("逐字符喂入", out === "Hello World", `got ${JSON.stringify(out)}`);
  }

  // 【3】换行符 \n 转义
  console.log("【3】换行符 \\n 转义");
  {
    const json = '{"answer":"第一行\\n第二行"}';
    const out = feedInSlices(json, 1);
    ok("\\n 解码为换行", out === "第一行\n第二行", `got ${JSON.stringify(out)}`);
  }

  // 【4】多种转义：\" \\ \/ \t \r \b \f
  console.log("【4】多种转义");
  {
    const json = '{"answer":"a\\"b\\\\c\\/d\\te\\rf\\bg\\fh"}';
    const out = feedInSlices(json, 1);
    ok("多种转义正确", out === 'a"b\\c/d\te\rf\bg\fh', `got ${JSON.stringify(out)}`);
  }

  // 【5】\uXXXX Unicode 转义（中文）
  console.log("【5】\\uXXXX Unicode 转义");
  {
    const json = '{"answer":"\\u4e2d\\u6587"}';
    const out = feedInSlices(json, 1);
    ok("\\uXXXX 解码为中文", out === "中文", `got ${JSON.stringify(out)}`);
  }

  // 【6】片段切在 \n 中间（\ 和 n 分开）
  console.log("【6】片段切在 \\n 中间");
  {
    const ext = new StreamingAnswerExtractor();
    let out = "";
    out += ext.feed('{"answer":"文本\\');  // 片段结束在 \
    out += ext.feed('n后续"}');             // 下一片段以 n 开头
    ok("跨片段 \\n 正确", out === "文本\n后续", `got ${JSON.stringify(out)}`);
  }

  // 【7】片段切在 \u4e2d 中间
  console.log("【7】片段切在 \\uXXXX 中间");
  {
    const ext = new StreamingAnswerExtractor();
    let out = "";
    out += ext.feed('{"answer":"\\u4e');
    out += ext.feed('2d"}');
    ok("跨片段 \\uXXXX 正确", out === "中", `got ${JSON.stringify(out)}`);
  }

  // 【8】片段切在 "answer" key 中间
  console.log("【8】片段切在 key 中间");
  {
    const ext = new StreamingAnswerExtractor();
    let out = "";
    out += ext.feed('{"ans');
    out += ext.feed('wer":"跨key"}');
    ok("跨 key 切片正确", out === "跨key", `got ${JSON.stringify(out)}`);
  }

  // 【9】answer 前有其他字段
  console.log("【9】answer 前有其他字段");
  {
    const json = '{"other":"x","answer":"目标文本"}';
    const out = feedInSlices(json, 1);
    ok("跳过前序字段", out === "目标文本", `got ${JSON.stringify(out)}`);
  }

  // 【10】value 含未转义引号外的内容（闭合后不再产出）
  console.log("【10】value 闭合后不再产出");
  {
    const ext = new StreamingAnswerExtractor();
    let out = "";
    out += ext.feed('{"answer":"内部"}');
    out += ext.feed(',"extra":"不应出现"');
    ok("闭合后停止", out === "内部", `got ${JSON.stringify(out)}`);
  }

  // 【11】get text() 与流式输出一致
  console.log("【11】text() 与流式一致");
  {
    const ext = new StreamingAnswerExtractor();
    const full = '{"answer":"流式\\n一致\\u6027"}';
    let out = "";
    for (let i = 0; i < full.length; i += 3) out += ext.feed(full.slice(i, i + 3));
    ok("text() == 流式拼接", ext.text === out && out === "流式\n一致性", `text=${JSON.stringify(ext.text)} out=${JSON.stringify(out)}`);
  }

  // 【12】大切片（整段一次性）
  console.log("【12】整段一次性喂入");
  {
    const ext = new StreamingAnswerExtractor();
    const out = ext.feed('{"answer":"整段输出\\n第二行"}');
    ok("整段喂入", out === "整段输出\n第二行", `got ${JSON.stringify(out)}`);
  }

  // 【13】空 answer
  console.log("【13】空 answer");
  {
    const ext = new StreamingAnswerExtractor();
    const out = ext.feed('{"answer":""}');
    ok("空 answer", out === "", `got ${JSON.stringify(out)}`);
  }

  // 【14】Markdown 内容（代码块、列表）
  console.log("【14】Markdown 内容");
  {
    const md = "# 标题\\n\\n- 列表项\\n\\n```python\\nprint(1)\\n```";
    const json = `{"answer":"${md}"}`;
    const out = feedInSlices(json, 2);
    ok("Markdown 转义还原", out === "# 标题\n\n- 列表项\n\n```python\nprint(1)\n```", `got ${JSON.stringify(out)}`);
  }

  // 【15】混合切片大小（随机）
  console.log("【15】随机切片");
  {
    const expected = "第一段\n第二段\"引号\"\\斜杠\u4e2d";
    const json = JSON.stringify({ answer: expected });
    // 用 JSON.stringify 生成标准转义，再随机切
    const sliceSizes = [1, 3, 5, 2, 7, 1, 4];
    const ext = new StreamingAnswerExtractor();
    let out = "";
    let i = 0;
    let si = 0;
    while (i < json.length) {
      const sz = sliceSizes[si % sliceSizes.length];
      si++;
      out += ext.feed(json.slice(i, i + sz));
      i += sz;
    }
    ok("随机切片还原", out === expected, `got ${JSON.stringify(out)}`);
  }

  console.log(`\n${passed} passed, ${failures.length} failed`);
  if (failures.length) {
    console.log("\n失败项：");
    failures.forEach((f) => console.log("  - " + f));
    process.exit(1);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
