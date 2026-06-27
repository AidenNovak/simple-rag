export type PaneName = "left" | "center" | "right";

export interface LayoutAssertResult {
  ok: boolean;
  errors: string[];
}

const PANE_ORDER: PaneName[] = ["left", "center", "right"];
const TOLERANCE_PX = 2;

function rect(el: Element): DOMRect {
  return (el as HTMLElement).getBoundingClientRect();
}

export function getPaneElements(root: HTMLElement): Record<PaneName, HTMLElement | null> {
  return {
    left: root.querySelector('[data-pane="left"]') as HTMLElement | null,
    center: root.querySelector('[data-pane="center"]') as HTMLElement | null,
    right: root.querySelector('[data-pane="right"]') as HTMLElement | null,
  };
}

/** 断言三栏存在、有高度、且水平顺序 left < center < right（允许 resizer 间隙） */
export function assertPaneLayout(root: HTMLElement): LayoutAssertResult {
  const errors: string[] = [];
  const panes = getPaneElements(root);

  for (const name of PANE_ORDER) {
    const el = panes[name];
    if (!el) {
      errors.push(`missing [data-pane="${name}"]`);
      continue;
    }
    const r = rect(el);
    if (r.height <= 0) errors.push(`pane "${name}" has zero height`);
    if (r.width <= 0) errors.push(`pane "${name}" has zero width`);
  }

  const left = panes.left ? rect(panes.left) : null;
  const center = panes.center ? rect(panes.center) : null;
  const right = panes.right ? rect(panes.right) : null;

  if (left && center && left.right - TOLERANCE_PX > center.left) {
    errors.push(`center pane overlaps or precedes left (left.right=${left.right}, center.left=${center.left})`);
  }
  if (center && right && center.right - TOLERANCE_PX > right.left) {
    errors.push(`right pane overlaps or precedes center (center.right=${center.right}, right.left=${right.left})`);
  }

  return { ok: errors.length === 0, errors };
}

/** composer 完全落在 chatPane 矩形内（容差 1px） */
export function isComposerContained(chatPane: HTMLElement, composer: HTMLElement, tolerance = 1): boolean {
  const p = chatPane.getBoundingClientRect();
  const c = composer.getBoundingClientRect();
  return (
    c.left >= p.left - tolerance &&
    c.right <= p.right + tolerance &&
    c.top >= p.top - tolerance &&
    c.bottom <= p.bottom + tolerance
  );
}
