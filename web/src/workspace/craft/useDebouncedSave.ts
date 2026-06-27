import { useEffect, useRef, useState } from "react";

export type SaveStatus = "idle" | "pending" | "saving";

/** value 变化后 delayMs 内无新变化 → 调 save(value)；返回可读状态。 */
export function useDebouncedSave(
  value: string,
  save: (v: string) => Promise<void>,
  delayMs = 800
): SaveStatus {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saving = useRef(false);
  const [status, setStatus] = useState<SaveStatus>("idle");

  useEffect(() => {
    setStatus("pending");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      saving.current = true;
      setStatus("saving");
      try {
        await save(value);
      } finally {
        saving.current = false;
        setStatus("idle");
      }
    }, delayMs);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [value, save, delayMs]);

  return status;
}
