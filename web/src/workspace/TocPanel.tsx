import { useState, useEffect } from "react";
import type { TocEntry } from "./craft/extractToc.js";

interface Props {
  toc: TocEntry[];
  scrollContainerRef: React.RefObject<HTMLDivElement>;
}

/** 右浮大纲：点击跳转到 heading，滚动高亮当前章节。仅 ≥3 heading 显示。 */
export function TocPanel({ toc, scrollContainerRef }: Props) {
  const [activeIdx, setActiveIdx] = useState(0);

  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) return;

    const onScroll = () => {
      const headings = el.querySelectorAll("h1, h2, h3");
      let idx = 0;
      headings.forEach((h, i) => {
        if (h.getBoundingClientRect().top < 120) idx = i;
      });
      setActiveIdx(idx);
    };

    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [scrollContainerRef]);

  if (toc.length < 3) return null;

  const handleClick = (text: string) => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const headings = el.querySelectorAll("h1, h2, h3");
    headings.forEach((h) => {
      if (h.textContent?.includes(text.slice(0, 30))) {
        h.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    });
  };

  return (
    <nav className="ws-toc-panel" data-testid="toc-panel" aria-label="大纲">
      <div className="ws-toc-title text-caption">大纲</div>
      <ul className="ws-toc-list">
        {toc.map((entry, i) => (
          <li
            key={i}
            className={`ws-toc-item ws-toc-l${entry.level}${i === activeIdx ? " active" : ""}`}
            onClick={() => handleClick(entry.text)}
          >
            {entry.text}
          </li>
        ))}
      </ul>
    </nav>
  );
}
