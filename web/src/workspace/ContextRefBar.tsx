import { useState } from "react";
import { IconNote } from "../Icons.js";
import type { RefNote } from "./ReferenceNotePicker.js";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
} from "../ui/index.js";

interface Props {
  selectedIds: string[];
  titles: Record<string, string>;
  notes: RefNote[];
  onToggle: (id: string, title: string) => void;
  onClear: () => void;
}

/** composer 上方常驻参考条：「参考：N 篇 / 标题 ▾」+ Radix 多选切换 + × 清除。 */
export function ContextRefBar({ selectedIds, titles, notes, onToggle, onClear }: Props) {
  const [open, setOpen] = useState(false);

  const label = selectedIds.length === 1
    ? `参考：${titles[selectedIds[0]] ?? ""}`
    : `参考：${selectedIds.length} 篇`;

  return (
    <div className="ws-context-ref-bar" data-testid="context-ref-bar">
      <IconNote size={12} />
      <DropdownMenu open={open} onOpenChange={setOpen}>
        <DropdownMenuTrigger asChild>
          <button type="button" className="ws-context-ref-label ws-context-ref-change" aria-label="更换参考笔记">
            {label} ▾
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" data-testid="context-ref-content">
          <DropdownMenuLabel>参考笔记（可多选）</DropdownMenuLabel>
          {notes.map((n) => {
            const checked = selectedIds.includes(n.id);
            return (
              <DropdownMenuItem key={n.id} onSelect={() => onToggle(n.id, n.title)}>
                <span aria-hidden>{checked ? "☑" : "☐"}</span>
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{n.title}</span>
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>
      <button type="button" className="ws-context-clear" aria-label="清除参考笔记" onClick={onClear}>×</button>
    </div>
  );
}
