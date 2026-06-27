import { useEffect, useRef } from "react";
import MarkdownRender from "markstream-react";
import "markstream-react/index.css";
import "katex/dist/katex.min.css";
import { normalizeMath } from "./normalizeMath.js";
import { useMarkstreamDark } from "../../theme/useMarkstreamDark.js";

const MIN_PICK_LEN = 10;

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
