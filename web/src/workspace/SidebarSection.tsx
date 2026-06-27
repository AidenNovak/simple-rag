import type { ReactNode } from "react";

interface Props {
  title: string;
  actionLabel: string;
  onAction?: () => void;
  actionIcon?: ReactNode;
  children: ReactNode;
}

/** Apple 风左栏分区：标题 + trailing action 按钮（+ / ↑）。 */
export function SidebarSection({ title, actionLabel, onAction, actionIcon, children }: Props) {
  return (
    <section className="ws-sidebar-section" data-testid={`sidebar-section-${title}`}>
      <div className="ws-sidebar-section-head">
        <h2 className="ws-sidebar-section-title">{title}</h2>
        {onAction && (
          <button type="button" className="icon-btn ws-sidebar-section-action" aria-label={actionLabel} onClick={onAction}>
            {actionIcon ?? "+"}
          </button>
        )}
      </div>
      <ul className="ws-sidebar-section-list">{children}</ul>
    </section>
  );
}
