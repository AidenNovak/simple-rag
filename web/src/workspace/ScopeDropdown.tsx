import { useState } from "react";
import { IconLibrary } from "../Icons.js";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "../ui/index.js";

interface Doc { id: string; title: string; }

interface Props {
  docs: Doc[];
  scopeDocIds: string[] | null;
  onToggleDoc: (id: string) => void;
  onSelectAll: () => void;
}

/** Scope 多选下拉：Radix DropdownMenu（自带 portal / focus trap / 键盘 / 点击外部关闭）。 */
export function ScopeDropdown({ docs, scopeDocIds, onToggleDoc, onSelectAll }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <button type="button" className="scope-badge">
          <IconLibrary size={13} />
          {scopeDocIds === null ? "全部文档" : `${scopeDocIds.length} 篇`}
          <span className="text-caption" style={{ opacity: 0.6 }}>▼</span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" data-testid="scope-dropdown-content">
        <DropdownMenuLabel>选择本会话检索的文档</DropdownMenuLabel>
        {docs.map((d) => {
          const checked = scopeDocIds === null || scopeDocIds.includes(d.id);
          return (
            <DropdownMenuItem key={d.id} onSelect={() => onToggleDoc(d.id)}>
              <span aria-hidden>{checked ? "☑" : "☐"}</span>
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.title}</span>
            </DropdownMenuItem>
          );
        })}
        <DropdownMenuSeparator style={{ height: 1, background: "var(--border)", margin: "4px 0" }} />
        <DropdownMenuItem onSelect={onSelectAll}>全选</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
