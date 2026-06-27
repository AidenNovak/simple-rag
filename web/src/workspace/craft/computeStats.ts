export interface WritingStats {
  chars: number;
  words: number;
  readTimeMin: number;
  paragraphs: number;
}

const CJK_RE = /[\u4e00-\u9fa5]/g;
const WORD_RE = /[a-zA-Z]+/g;
const WPM = 300;

/** 从 markdown 文本计算写作统计：字数、阅读时间、段落数。 */
export function computeStats(content: string): WritingStats {
  const chars = content.length;
  const cjk = (content.match(CJK_RE) || []).length;
  const en = (content.match(WORD_RE) || []).length;
  const words = cjk + en;
  const readTimeMin = Math.max(1, Math.ceil(words / WPM));
  const paragraphs = content.split(/\n\n+/).filter((s) => s.trim()).length;
  return { chars, words, readTimeMin, paragraphs };
}
