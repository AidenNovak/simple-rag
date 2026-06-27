import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.js";
import { ToastProvider } from "./components/Toast.js";
import { applyTheme, getStoredTheme } from "./theme/useTheme.js";
import "./theme/tokens.css";
import "./theme/typography.css";
import "./theme/motion.css";
import "./ui/ui.css";
import "./styles.css";

// boot 前应用主题，避免首屏闪烁（TB1）
applyTheme(getStoredTheme());

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ToastProvider>
      <App />
    </ToastProvider>
  </React.StrictMode>
);
