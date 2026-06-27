import { useEffect, useRef } from "react";
import MarkdownRender from "markstream-react";
import "markstream-react/index.css";
import "katex/dist/katex.min.css";
import { normalizeMath } from "./normalizeMath.js";
import { useMarkstreamDark } from "../../theme/useMarkstreamDark.js";

const MIN_PICK_LEN = 10;

/** MutationObserver：给渲染后的 pre 加语言标签 + 复制按钮。
 *  markstream 逐 token 渲染，DOM 持续变化，需 observer 持续增强。 */
function useCodeBlockEnhancer(containerRef: React.RefObject<HTMLElement>) {
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const enhancePre = (pre: HTMLPreElement) => {
      if (pre.dataset.enhanced) return;
      pre.dataset.enhanced = "1";

      // 语言标签：从 code class 提取（markstream 给 code 加 language-xxx）
      const code = pre.querySelector("code");
      if (code) {
        const langClass = Array.from(code.classList).find((c) => c.startsWith("language-"));
        if (langClass) {
          pre.dataset.lang = langClass.replace("language-", "");
        }
      }

      // 复制按钮
      const btn = document.createElement("button");
      btn.className = "ws-copy-btn";
      btn.textContent = "复制";
      btn.setAttribute("aria-label", "复制代码");
      btn.addEventListener("click", () => {
        const text = pre.querySelector("code")?.textContent || "";
        navigator.clipboard.writeText(text).then(() => {
          btn.textContent = "已复制";
          setTimeout(() => { btn.textContent = "复制"; }, 2000);
        });
      });
      pre.appendChild(btn);
    };

    const observer = new MutationObserver(() => {
      el.querySelectorAll("pre").forEach((p) => enhancePre(p as HTMLPreElement));
    });
    observer.observe(el, { childList: true, subtree: true });
    el.querySelectorAll("pre").forEach((p) => enhancePre(p as HTMLPreElement));

    return () => observer.disconnect();
  }, [containerRef]);
}

interface Props {
  content: string;
  onOpenPeek: () => void;
  onPick: (text: string) => void;
  scrollContainerRef?: React.RefObject<HTMLDivElement>;
}

/** 默认 Markdown 渲染层：双击开 SourcePeek，mouseup 选区 ≥10 字触发 onPick。 */
export function CraftBody({ content, onOpenPeek, onPick, scrollContainerRef }: Props) {
  const innerRef = useRef<HTMLDivElement>(null);
  const ref = scrollContainerRef ?? innerRef;
  const dark = useMarkstreamDark();

  useCodeBlockEnhancer(ref);

  const handleMouseUp = () => {
    const sel = window.getSelection();
    const text = sel?.toString().trim() ?? "";
    if (text.length >= MIN_PICK_LEN) onPick(text);
  };

  return (
    <div
      ref={ref}
      className="ws-craft-body"
      data-testid="craft-body"
      onDoubleClick={onOpenPeek}
      onMouseUp={handleMouseUp}
    >
      <div className="ws-craft-inner markstream-react ws-prose">
        <MarkdownRender content={normalizeMath(content)} final={true} fade={false} dark={dark} />
      </div>
    </div>
  );
}
