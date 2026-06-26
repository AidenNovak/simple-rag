#!/usr/bin/env node
/**
 * 一次性 OCR：把指定 PDF 用 GLM-OCR 转成 Markdown。
 * 用法：
 *   npx tsx scripts/ocr-one-off.ts <input.pdf> [output.md]
 */
import { readFile, writeFile } from "node:fs/promises";
import { basename } from "node:path";
import { config } from "../server/src/config/index.js";
import { ocrPdf } from "../server/src/llm/ocr.js";

async function main() {
  const [input, outputArg] = process.argv.slice(2);
  if (!input) {
    console.error("Usage: npx tsx scripts/ocr-one-off.ts <input.pdf> [output.md]");
    process.exit(1);
  }
  const output = outputArg || input.replace(/\.pdf$/i, ".md");
  const slug = basename(input, ".pdf").replace(/[^a-zA-Z0-9\u4e00-\u9fa5_-]/g, "_");

  if (!config.glmOcrKey) {
    console.error("[ocr] GLM_OCR_API_KEY not configured");
    process.exit(1);
  }

  console.log(`[ocr] reading ${input}`);
  const pdfBytes = await readFile(input);
  console.log(`[ocr] ${pdfBytes.length} bytes, model=${config.glmOcrModel}`);

  const result = await ocrPdf(pdfBytes, slug);
  await writeFile(output, result.md, "utf-8");
  console.log(`[ocr] done: chunks=${result.chunks}, failed=${result.failed}, usage=${JSON.stringify(result.usage)}`);
  console.log(`[ocr] wrote ${output}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
