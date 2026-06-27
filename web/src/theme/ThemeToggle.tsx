import { useSyncExternalStore } from "react";
import { applyTheme, getStoredTheme, setStoredTheme, type Theme } from "./useTheme.js";

function subscribe(cb: () => void) {
  const handler = () => cb();
  window.addEventListener("kb:theme-changed", handler);
  return () => window.removeEventListener("kb:theme-changed", handler);
}
function getSnapshot(): Theme {
  return (document.documentElement.dataset.theme as Theme) || getStoredTheme();
}

export function ThemeToggle() {
  const theme = useSyncExternalStore(subscribe, getSnapshot, () => "light" as Theme);
  const nextLabel = theme === "light" ? "切换到暗色" : "切换到浅色";

  return (
    <button
      type="button"
      className="icon-btn theme-toggle"
      aria-label={`切换主题，当前${theme === "light" ? "浅色" : "暗色"}`}
      title={nextLabel}
      onClick={() => {
        const next: Theme = theme === "light" ? "dark" : "light";
        setStoredTheme(next);
        applyTheme(next);
        window.dispatchEvent(new Event("kb:theme-changed"));
      }}
    >
      {theme === "light" ? "🌙" : "☀️"}
    </button>
  );
}
