/**
 * 扫描件 OCR —— 智谱 GLM-OCR（layout_parsing 接口，非 OpenAI 兼容）。
 *
 * 接口：智谱原生 /api/paas/v4/document/layout_parsing
 *   - model: glm-ocr
 *   - 输入：data:application/pdf;base64,<b64>
 *   - 输出：md_results（Markdown）
 *   - 限制：每 chunk ≤ 45MB（base64 后约 60MB）；429 退避重试
 *
 * 直调智谱原生 API（fetch，无需 Python 子进程），
 * 按 ocrChunkPages 切分 chunk PDF → 逐 chunk 调用 → 拼接 Markdown。
 *
 * 注意：PDF 切分依赖 pdf-lib（轻量纯 JS），运行时按需 import 以避免首屏开销。
 */
import { config } from "../config/index.js";
import { logger } from "../config/logger.js";

const ZHIPU_BASE = "https://open.bigmodel.cn/api/paas/v4";
const MAX_CHUNK_BYTES = 45 * 1024 * 1024;
const MAX_RETRIES = 6;

/** 生成智谱 JWT 鉴权 token（ZAI_API_KEY = {id}.{secret}）。 */
async function zhipuToken(apiKey: string): Promise<string> {
  const [id, secret] = apiKey.split(".");
  if (!id || !secret) throw new Error("[ocr] GLM key must be '{id}.{secret}' format");
  // 智谱鉴权使用 HS256，3 小时有效
  const header = Buffer.from(JSON.stringify({ alg: "HS256", sign_type: "SIGN" })).toString("base64url");
  const payload = Buffer.from(
    JSON.stringify({
      api_key: id,
      exp: Math.floor(Date.now() / 1000) + 3600 * 3,
      timestamp: Math.floor(Date.now() / 1000),
    })
  ).toString("base64url");
  const crypto = await import("node:crypto");
  const signingInput = `${header}.${payload}`;
  const sig = crypto.createHmac("sha256", secret).update(signingInput).digest("base64url");
  return `${signingInput}.${sig}`;
}

interface OcrUsage {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
}

/** 对单个 chunk PDF 字节调用 glm-ocr，返回 Markdown。 */
export async function ocrChunkPdf(pdfBytes: Buffer, requestId: string): Promise<{ md: string; usage: OcrUsage }> {
  if (pdfBytes.byteLength > MAX_CHUNK_BYTES) {
    throw new Error(`[ocr] chunk too big: ${(pdfBytes.byteLength / 1e6).toFixed(1)}MB`);
  }
  if (!config.glmOcrKey) throw new Error("[ocr] GLM_OCR_API_KEY not configured");

  const token = await zhipuToken(config.glmOcrKey);
  const b64 = pdfBytes.toString("base64");
  const fileArg = `data:application/pdf;base64,${b64}`;

  let lastErr: Error | null = null;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const resp = await fetch(`${ZHIPU_BASE}/document/layout_parsing`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          model: config.glmOcrModel,
          file: fileArg,
          request_id: requestId.slice(0, 64),
        }),
      });
      if (!resp.ok) {
        const txt = await resp.text();
        const err = new Error(`[ocr] HTTP ${resp.status}: ${txt.slice(0, 200)}`);
        (err as any).status = resp.status;
        throw err;
      }
      const data: any = await resp.json();
      const md: string | undefined = data?.md_results ?? data?.output?.md_results;
      if (!md) throw new Error(`[ocr] no md_results in response`);
      return { md, usage: data?.usage || {} };
    } catch (e) {
      lastErr = e as Error;
      const s = (e as Error).message + String((e as any).status || "");
      const is429 = /429|1302|rate/i.test(s);
      const wait = is429 ? 10 + 5 * attempt : Math.min(60, 2 ** attempt);
      logger.warn({ requestId, attempt, wait, err: (e as Error).message }, "ocr retry");
      await new Promise((r) => setTimeout(r, wait * 1000));
    }
  }
  throw new Error(`[ocr] giving up after ${MAX_RETRIES}: ${lastErr?.message}`);
}

/** 把整本 PDF 按 pagesPerChunk 切成多份 chunk PDF。返回 [{bytes, pageStart, pageEnd}]。 */
export async function splitPdf(
  pdfBytes: Buffer,
  pagesPerChunk = config.ocrChunkPages
): Promise<{ bytes: Buffer; pageStart: number; pageEnd: number }[]> {
  const { PDFDocument } = await import("pdf-lib");
  const src = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
  const total = src.getPageCount();
  const out: { bytes: Buffer; pageStart: number; pageEnd: number }[] = [];
  for (let start = 0; start < total; start += pagesPerChunk) {
    const end = Math.min(start + pagesPerChunk, total);
    const part = await PDFDocument.create();
    const idxs = Array.from({ length: end - start }, (_, i) => start + i);
    const copied = await part.copyPages(src, idxs);
    copied.forEach((p) => part.addPage(p));
    const bytes = Buffer.from(await part.save());
    out.push({ bytes, pageStart: start + 1, pageEnd: end });
  }
  return out;
}

/**
 * OCR 整本扫描版 PDF → Markdown。逐 chunk 调用，拼接时保留页码注释。
 * 失败的 chunk 会被记录但不会中断整体（返回已成功部分 + 错误列表）。
 */
export async function ocrPdf(
  pdfBytes: Buffer,
  slug: string
): Promise<{ md: string; chunks: number; failed: number; usage: OcrUsage }> {
  const parts = await splitPdf(pdfBytes);
  logger.info({ slug, chunks: parts.length }, "ocr start");
  const sections: string[] = [`<!-- GLM-OCR 输出，源: ${slug}.pdf -->\n`];
  let failed = 0;
  const agg: OcrUsage = {};
  for (const part of parts) {
    const rid = `${slug}-p${part.pageStart}-${part.pageEnd}`;
    try {
      const { md, usage } = await ocrChunkPdf(part.bytes, rid);
      sections.push(`\n<!-- chunk start_page=${part.pageStart} end_page=${part.pageEnd} -->\n${md}`);
      agg.prompt_tokens = (agg.prompt_tokens || 0) + (usage.prompt_tokens || 0);
      agg.total_tokens = (agg.total_tokens || 0) + (usage.total_tokens || 0);
    } catch (e) {
      failed++;
      sections.push(`\n<!-- chunk start_page=${part.pageStart} FAILED: ${(e as Error).message} -->`);
      logger.error({ rid, err: (e as Error).message }, "ocr chunk failed");
    }
  }
  return { md: sections.join("\n"), chunks: parts.length, failed, usage: agg };
}
