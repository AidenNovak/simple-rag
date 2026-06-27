const NEEDLE_MAX = 80;
const DEFAULT_LINE_HEIGHT = 28;
const FLASH_MS = 2000;

export function findSnippetIndex(content: string, snippet: string): number {
  const needle = snippet.trim().slice(0, NEEDLE_MAX);
  if (!needle) return -1;
  return content.indexOf(needle);
}

export function scrollCraftToSnippet(
  container: HTMLElement,
  content: string,
  snippet: string,
  opts?: { lineHeight?: number }
): boolean {
  const idx = findSnippetIndex(content, snippet);
  if (idx < 0) return false;
  const lineHeight = opts?.lineHeight ?? DEFAULT_LINE_HEIGHT;
  const lineNum = content.slice(0, idx).split("\n").length;
  container.scrollTop = Math.max(0, (lineNum - 3) * lineHeight);
  container.classList.add("ws-snippet-flash");
  window.setTimeout(() => container.classList.remove("ws-snippet-flash"), FLASH_MS);
  return true;
}
