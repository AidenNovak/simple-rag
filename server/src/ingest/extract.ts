/**
 * 多格式文档抽取 → 统一输出 Markdown（带 locator 注释，便于引用定位）。
 *
 * 支持格式：
 *   - PDF：文本层用 pdf-parse；若文本过少（扫描件），回退走 GLM-OCR
 *   - Word (.docx)：mammoth
 *   - PPTX (.pptx)：pptxtojson + turndown
 *   - XLSX (.xlsx)：xlsx（SheetJS）→ 每表 markdown 表格
 *   - Markdown / TXT：直读
 *   - HTML：turndown（+ readability 可选清洗正文）
 *   - EPUB：epub2 → 逐章 turndown
 *   - 图片：跳过文本抽取（未来可接 OCR/Vision）
 *
 * 输出约定：Markdown 正文；locator 以注释行 `<!-- page=N -->` 嵌入。
 */
import { logger } from "../config/logger.js";

export interface ExtractResult {
  md: string;
  /** 透传给 chunk 的全局 locator 类型，如 page/slide/sheet/chapter */
  locatorKind?: string;
  /** 是否扫描件（触发 OCR 的依据） */
  needsOcr?: boolean;
}

const MIN_TEXT_RATIO = 0.01; // PDF 文本字节数 / 页数 < 阈值 → 视为扫描件

/** 入口：按扩展名/mime 路由到对应抽取器。 */
export async function extractFile(
  filePath: string,
  ext: string,
  mimeType: string
): Promise<ExtractResult> {
  const e = ext.toLowerCase().replace(/^\./, "");
  switch (e) {
    case "pdf":
      return extractPdf(filePath);
    case "docx":
      return extractDocx(filePath);
    case "pptx":
      return extractPptx(filePath);
    case "xlsx":
    case "xls":
    case "csv":
      return extractXlsx(filePath, e === "csv");
    case "md":
    case "markdown":
    case "txt":
    case "text":
      return { md: await readText(filePath) };
    case "html":
    case "htm":
      return extractHtml(filePath);
    case "epub":
      return extractEpub(filePath);
    default:
      // 兜底：尝试当文本读
      logger.warn({ ext, mimeType }, "unknown format, trying raw text");
      try {
        return { md: await readText(filePath) };
      } catch {
        throw new Error(`unsupported file format: ${ext}`);
      }
  }
}

async function readText(p: string): Promise<string> {
  const fs = await import("node:fs/promises");
  return fs.readFile(p, "utf8");
}

async function extractPdf(p: string): Promise<ExtractResult> {
  const pdfParse = (await import("pdf-parse")).default;
  const data = await pdfParse(p);
  const pages = data.npages || 1;
  const text = data.text || "";
  // 扫描件判定：平均每页有效字符过少 → 视为扫描件，标记走 OCR
  if (text.trim().length / pages < 200) {
    return { md: text, needsOcr: true, locatorKind: "page" };
  }
  // pdf-parse 不给分页文本，整段返回（locator 粒度退化为整文档）
  return { md: text.trim(), locatorKind: "page" };
}

async function extractDocx(p: string): Promise<ExtractResult> {
  const mammoth = await import("mammoth");
  const fs = await import("node:fs/promises");
  const buf = await fs.readFile(p);
  const { value: html } = await mammoth.convertToHtml({ buffer: buf });
  const { default: TurndownService } = await import("turndown");
  const md = new TurndownService({ headingStyle: "atx" }).turndown(html);
  return { md, locatorKind: "paragraph" };
}

async function extractPptx(p: string): Promise<ExtractResult> {
  const fs = await import("node:fs/promises");
  const buf = await fs.readFile(p);
  // pptxtojson 是 ESM-only 包，CJS interop 复杂 → 直接引其 .cjs 构建产物
  const { createRequire } = await import("node:module");
  const require = createRequire(import.meta.url);
  const mod = require("pptxtojson/dist/index.cjs");
  const parse: (input: Buffer | ArrayBuffer) => Promise<any> = mod.parse || mod.default || mod;
  const json: any = await parse(buf);
  const slides: string[] = [];
  (json.slides || []).forEach((slide: any, i: number) => {
    const texts = (slide.elements || [])
      .filter((el: any) => el.content)
      .map((el: any) => el.content)
      .flat()
      .filter((t: any) => t && t.text)
      .map((t: any) => t.text);
    slides.push(`<!-- slide=${i + 1} -->\n${texts.join("\n\n")}`);
  });
  return { md: slides.join("\n\n---\n\n"), locatorKind: "slide" };
}

async function extractXlsx(p: string, isCsv: boolean): Promise<ExtractResult> {
  // xlsx 在 ESM 下命名导出 read/utils，readFile 不在顶层 → 用 read(buffer)
  const XLSX = await import("xlsx");
  const fs = await import("node:fs/promises");
  const buf = await fs.readFile(p);
  const xlsx: any = (XLSX as any).default || XLSX;
  const wb = xlsx.read(buf, { type: "buffer" });
  const sheets: string[] = [];
  for (const name of wb.SheetNames) {
    const ws = wb.Sheets[name];
    const csv = xlsx.utils.sheet_to_csv(ws);
    sheets.push(`<!-- sheet=${name} -->\n${csv}`);
  }
  return { md: sheets.join("\n\n---\n\n"), locatorKind: "sheet" };
}

async function extractHtml(p: string): Promise<ExtractResult> {
  const raw = await readText(p);
  const { default: TurndownService } = await import("turndown");
  return { md: new TurndownService({ headingStyle: "atx" }).turndown(raw), locatorKind: "section" };
}

async function extractEpub(p: string): Promise<ExtractResult> {
  const { default: EPub } = await import("epub2");
  const { default: TurndownService } = await import("turndown");
  const td = new TurndownService({ headingStyle: "atx" });
  return await new Promise<ExtractResult>((resolve, reject) => {
    const epub = new EPub(p);
    epub.on("end", () => {
      const flow = epub.flow || [];
      let pending = flow.length;
      if (pending === 0) return resolve({ md: "", locatorKind: "chapter" });
      const parts: string[] = [];
      flow.forEach((chap: any, i: number) => {
        epub.getChapter(chap.id, (err: Error | null, html?: string) => {
          if (!err && html) {
            parts.push(`<!-- chapter=${i + 1} id=${chap.id} -->\n${td.turndown(html)}`);
          }
          if (--pending === 0) resolve({ md: parts.join("\n\n---\n\n"), locatorKind: "chapter" });
        });
      });
    });
    epub.on("error", reject);
    epub.parse();
  });
}
