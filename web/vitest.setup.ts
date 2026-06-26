import "@testing-library/jest-dom/vitest";
import { beforeEach, vi } from "vitest";

// Vitest 4 的 jsdom 不提供可用 localStorage；装一个最小内存实现，供 Store 持久化测试用。
function makeLocalStorage(): Storage {
  const store = new Map<string, string>();
  return {
    get length() { return store.size; },
    clear: () => store.clear(),
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    key: (i: number) => [...store.keys()][i] ?? null,
    removeItem: (k: string) => { store.delete(k); },
    setItem: (k: string, v: string) => { store.set(k, String(v)); },
  };
}

const ls = makeLocalStorage();
vi.stubGlobal("localStorage", ls);
if (typeof window !== "undefined") {
  Object.defineProperty(window, "localStorage", { value: ls, configurable: true });
}

beforeEach(() => ls.clear());
