import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { IconCheck, IconAlert, IconClose } from "../Icons.js";

/** 极简 Toast 通知系统。 */
type ToastType = "success" | "error" | "info";
interface Toast { id: number; type: ToastType; message: string }

const ToastCtx = createContext<(type: ToastType, message: string) => void>(() => {});
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const show = useCallback((type: ToastType, message: string) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, type, message }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3500);
  }, []);

  return (
    <ToastCtx.Provider value={show}>
      {children}
      <div className="toast-container">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast-${t.type}`}>
            {t.type === "success" ? <IconCheck size={16} /> : t.type === "error" ? <IconAlert size={16} /> : <IconAlert size={16} />}
            <span>{t.message}</span>
            <button className="toast-close" onClick={() => setToasts((x) => x.filter((y) => y.id !== t.id))}><IconClose size={14} /></button>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
