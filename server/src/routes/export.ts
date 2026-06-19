/**
 * 笔记导出路由：PDF + DOCX。
 *
 * PDF：用 pdf-lib 纯 JS 生成（无 Chromium 依赖），Markdown 用 marked 转 HTML 再简化为文本段落。
 * DOCX：用 docx 库，Markdown 标题/列表/表格/加粗 → Word 结构化元素。
 */
import type { FastifyInstance } from "fastify";
import { and, eq } from "drizzle-orm";
import { getDb, schema } from "../db/client.js";
import { authGuard, requireUser, type AuthedRequest } from "../auth/middleware.js";
import { NotFoundError } from "../errors.js";

export async function exportRoutes(app: FastifyInstance) {
  // ---- 导出 PDF ----
  app.get("/notes/:id/export/pdf", { preHandler: [authGuard] }, async (req: AuthedRequest, reply) => {
    const user = requireUser(req);
    const id = (req.params as { id: string }).id;
    const db = getDb();
    const [doc] = await db.select().from(schema.documents)
      .where(and(eq(schema.documents.id, id), eq(schema.documents.userId, user.id))).limit(1);
    if (!doc) throw new NotFoundError("文档");

    const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");
    const pdf = await PDFDocument.create();
    pdf.setTitle(doc.title);
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    const boldFont = await pdf.embedFont(StandardFonts.HelveticaBold);
    const W = 595, H = 842; // A4
    const margin = 50;
    let page = pdf.addPage([W, H]);
    let y = H - margin;
    const lineH = 18;
    const maxWidth = W - margin * 2;

    const writeLine = (text: string, opts: { bold?: boolean; size?: number; gap?: number } = {}) => {
      const f = opts.bold ? boldFont : font;
      const size = opts.size ?? 11;
      const gap = opts.gap ?? 4;
      // 简单换行
      const words = text.split("");
      let line = "";
      const lines: string[] = [];
      for (const ch of words) {
        const test = line + ch;
        if (f.widthOfTextAtSize(test, size) > maxWidth) { lines.push(line); line = ch; }
        else line = test;
      }
      if (line) lines.push(line);
      for (const ln of lines) {
        if (y < margin) { page = pdf.addPage([W, H]); y = H - margin; }
        page.drawText(ln, { x: margin, y, size, font: f, color: rgb(0.1, 0.1, 0.1) });
        y -= lineH;
      }
      y -= gap;
    };

    // 标题
    writeLine(doc.title, { bold: true, size: 20, gap: 12 });
    // 正文：按行处理 Markdown
    const content = doc.contentMd || "";
    for (const rawLine of content.split("\n")) {
      const line = rawLine.trimEnd();
      if (!line.trim()) { y -= lineH * 0.5; continue; }
      if (line.startsWith("# ")) { writeLine(line.replace(/^#+\s/, ""), { bold: true, size: 16 }); continue; }
      if (line.startsWith("## ")) { writeLine(line.replace(/^#+\s/, ""), { bold: true, size: 14 }); continue; }
      if (line.startsWith("### ")) { writeLine(line.replace(/^#+\s/, ""), { bold: true, size: 12 }); continue; }
      if (line.startsWith("- ") || line.startsWith("* ")) { writeLine("  • " + line.replace(/^[-*]\s/, "")); continue; }
      if (/^\d+\.\s/.test(line)) { writeLine("  " + line); continue; }
      if (line.startsWith("|")) { writeLine(line); continue; } // 表格保留原文
      // 去掉 ** 和 ` 标记
      writeLine(line.replace(/\*\*/g, "").replace(/`/g, ""));
    }

    const buf = await pdf.save();
    reply.header("Content-Type", "application/pdf");
    reply.header("Content-Disposition", `attachment; filename="${encodeURIComponent(doc.title)}.pdf"`);
    reply.send(Buffer.from(buf));
  });

  // ---- 导出 DOCX ----
  app.get("/notes/:id/export/docx", { preHandler: [authGuard] }, async (req: AuthedRequest, reply) => {
    const user = requireUser(req);
    const id = (req.params as { id: string }).id;
    const db = getDb();
    const [doc] = await db.select().from(schema.documents)
      .where(and(eq(schema.documents.id, id), eq(schema.documents.userId, user.id))).limit(1);
    if (!doc) throw new NotFoundError("文档");

    const { Document, Packer, Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell, WidthType } = await import("docx");
    const content = doc.contentMd || "";
    const children: any[] = [];

    // 标题
    children.push(new Paragraph({ text: doc.title, heading: HeadingLevel.TITLE }));

    // 解析 Markdown
    const lines = content.split("\n");
    let tableRows: string[][] = [];
    let inTable = false;

    const flushTable = () => {
      if (tableRows.length === 0) return;
      const rows = tableRows.map((cells) =>
        new TableRow({
          children: cells.map((cell) =>
            new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: cell.trim() })] })] })
          ),
        })
      );
      children.push(new Table({ rows, width: { size: 100, type: WidthType.PERCENTAGE } }));
      children.push(new Paragraph({ text: "" }));
      tableRows = [];
      inTable = false;
    };

    for (const rawLine of lines) {
      const line = rawLine.trimEnd();
      if (line.startsWith("|") && line.endsWith("|")) {
        inTable = true;
        const cells = line.split("|").slice(1, -1);
        // 跳过分隔行 |---|---|
        if (!cells.every((c) => /^[-:\s]+$/.test(c))) {
          tableRows.push(cells);
        }
        continue;
      }
      if (inTable) flushTable();
      if (!line.trim()) { children.push(new Paragraph({ text: "" })); continue; }
      if (line.startsWith("# ")) { children.push(new Paragraph({ text: line.replace(/^#+\s/, ""), heading: HeadingLevel.HEADING_1 })); continue; }
      if (line.startsWith("## ")) { children.push(new Paragraph({ text: line.replace(/^#+\s/, ""), heading: HeadingLevel.HEADING_2 })); continue; }
      if (line.startsWith("### ")) { children.push(new Paragraph({ text: line.replace(/^#+\s/, ""), heading: HeadingLevel.HEADING_3 })); continue; }
      if (line.startsWith("- ") || line.startsWith("* ")) { children.push(new Paragraph({ text: line.replace(/^[-*]\s/, ""), bullet: { level: 0 } })); continue; }
      if (/^\d+\.\s/.test(line)) { children.push(new Paragraph({ text: line.replace(/^\d+\.\s/, ""), numbering: { reference: "num", level: 0 } })); continue; }
      // 普通段落：解析 **bold** 和 `code`
      const runs: any[] = [];
      const parts = line.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
      for (const part of parts) {
        if (part.startsWith("**") && part.endsWith("**")) {
          runs.push(new TextRun({ text: part.slice(2, -2), bold: true }));
        } else if (part.startsWith("`") && part.endsWith("`")) {
          runs.push(new TextRun({ text: part.slice(1, -1), font: "Courier New" }));
        } else if (part) {
          runs.push(new TextRun({ text: part }));
        }
      }
      children.push(new Paragraph({ children: runs }));
    }
    if (inTable) flushTable();

    const docxDoc = new Document({ sections: [{ children }] });
    const buf = await Packer.toBuffer(docxDoc);
    reply.header("Content-Type", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
    reply.header("Content-Disposition", `attachment; filename="${encodeURIComponent(doc.title)}.docx"`);
    reply.send(Buffer.from(buf));
  });
}
