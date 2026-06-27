export interface TocEntry {
  level: number;
  text: string;
}

const HEADING_RE = /^(#{1,3})\s+(.+)$/;

/** 从 markdown 提取 h1-h3 大纲。跳过代码块内的 # 行。 */
export function extractToc(markdown: string): TocEntry[] {
  const lines = markdown.split("\n");
  const result: TocEntry[] = [];
  let inCodeBlock = false;

  for (const line of lines) {
    if (line.trim().startsWith("```")) {
      inCodeBlock = !inCodeBlock;
      continue;
    }
    if (inCodeBlock) continue;
    const m = line.match(HEADING_RE);
    if (m) {
      result.push({ level: m[1].length, text: m[2].trim() });
    }
  }
  return result;
}
