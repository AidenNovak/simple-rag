import type { ReactNode } from "react";

export type BadgeVariant = "pending" | "ready" | "failed" | "neutral";

interface Props {
  variant: BadgeVariant;
  children: ReactNode;
  className?: string;
}

/** 统一状态 pill：替代散落 emoji，配色走 token（禁止 emoji children）。 */
export function Badge({ variant, children, className = "" }: Props) {
  return (
    <span className={`ui-badge ui-badge--${variant} ${className}`.trim()} data-variant={variant}>
      {children}
    </span>
  );
}
