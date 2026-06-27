import { useSyncExternalStore } from "react";

function subscribe(cb: () => void) {
  const h = () => cb();
  window.addEventListener("kb:theme-changed", h);
  return () => window.removeEventListener("kb:theme-changed", h);
}

/** MarkdownRender dark prop 驱动：仅 data-theme=dark 时为 true，light 纸面 false。 */
export function useMarkstreamDark(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => document.documentElement.dataset.theme === "dark",
    () => false
  );
}
