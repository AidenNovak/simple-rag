/**
 * 文本切分（传统 RAG 风格）。
 *
 * 策略：
 *   - 优先按结构边界切（Markdown 标题、注释 locator 行、空行段落）
 *   - 段落仍超 maxChars 则按句子回退切分
 *   - 相邻段落合并直到接近 maxChars
 *   - overlap 用于跨边界召回保障
 *
 * locator 提取：扫描 `<!-- key=value -->` 行，把最近一个 locator 挂到该 chunk。
 */
export interface ChunkOut {
  text: string;
  locator: Record<string, string | number> | null;
  tokenCount: number;
}

const SENTENCE_END = /([。！？!?.；;\n])/;

/** 兜底硬切：无标点的超长串，按 maxChars 等分（带 overlap 衔接）。 */
function hardSplit(text: string, maxChars: number, overlap: number): string[] {
  const pieces: string[] = [];
  let i = 0;
  while (i < text.length) {
    const end = Math.min(i + maxChars, text.length);
    pieces.push(text.slice(i, end));
    if (end >= text.length) break;
    i = end - overlap; // 回退 overlap 保证跨块衔接
    if (i <= 0) i = end; // 防死循环
  }
  return pieces;
}

export function chunkMarkdown(
  md: string,
  opts: { maxChars?: number; overlap?: number } = {}
): ChunkOut[] {
  const maxChars = opts.maxChars ?? 1200;
  const overlap = opts.overlap ?? 150;

  // 1. 拆成段落（保留 locator 注释行作为独立 token）
  const lines = md.split(/\r?\n/);
  const paragraphs: { text: string; locator: Record<string, string | number> | null }[] = [];
  let currentLocator: Record<string, string | number> | null = null;
  let buf: string[] = [];

  const flush = () => {
    const text = buf.join("\n").trim();
    if (text) paragraphs.push({ text, locator: currentLocator ? { ...currentLocator } : null });
    buf = [];
  };

  for (const line of lines) {
    const loc = parseLocator(line);
    if (loc) {
      flush();
      currentLocator = { ...(currentLocator || {}), ...loc };
      continue;
    }
    if (line.trim() === "") {
      flush();
      continue;
    }
    buf.push(line);
  }
  flush();

  // 2. 合并段落直到接近 maxChars
  const merged: typeof paragraphs = [];
  for (const p of paragraphs) {
    const last = merged[merged.length - 1];
    const lastLen = last ? last.text.length : 0;
    if (last && lastLen + p.text.length + 2 <= maxChars) {
      last.text = `${last.text}\n\n${p.text}`;
      // 后出现的 locator 覆盖（更精确的页码）
      if (p.locator) last.locator = { ...(last.locator || {}), ...p.locator };
    } else {
      merged.push({ ...p });
    }
  }

  // 3. 超长段落按句子切分（带 overlap）
  const out: ChunkOut[] = [];
  for (const p of merged) {
    if (p.text.length <= maxChars) {
      out.push(toChunk(p.text, p.locator));
      continue;
    }
    const sentences = p.text.split(SENTENCE_END).reduce<string[]>((acc, s, i, arr) => {
      if (i % 2 === 0) acc.push(s + (arr[i + 1] || ""));
      return acc;
    }, []);
    let cur = "";
    for (const s of sentences) {
      // 兜底：单个句子仍超 maxChars（无标点的超长行）→ 硬切
      const toAdd = s.length > maxChars ? hardSplit(s, maxChars, overlap) : [s];
      for (const piece of toAdd) {
        if ((cur + piece).length > maxChars && cur) {
          out.push(toChunk(cur.trim(), p.locator));
          cur = cur.slice(-overlap) + piece;
        } else {
          cur += piece;
        }
      }
    }
    if (cur.trim()) out.push(toChunk(cur.trim(), p.locator));
  }
  return out;
}

function parseLocator(line: string): Record<string, string | number> | null {
  const m = /<!--\s*(.+?)\s*-->/.exec(line.trim());
  if (!m) return null;
  const obj: Record<string, string | number> = {};
  // 支持 "page=3" / "slide=2" / "chapter=5 id=foo" 多键
  for (const kv of m[1].split(/\s+/)) {
    const [k, v] = kv.split("=");
    if (!k) continue;
    const n = Number(v);
    obj[k] = Number.isFinite(n) && v !== "" ? n : (v ?? "");
  }
  return Object.keys(obj).length ? obj : null;
}

function toChunk(text: string, locator: Record<string, string | number> | null): ChunkOut {
  // token 粗估：英文 ~4 字符/token，中文 ~1.5 字符/token；折中 2.5
  return { text, locator, tokenCount: Math.ceil(text.length / 2.5) };
}
