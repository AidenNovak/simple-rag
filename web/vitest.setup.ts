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

// cmdk（及部分 Radix）依赖 ResizeObserver，jsdom 未实现；注入 no-op polyfill。
if (typeof globalThis.ResizeObserver === "undefined") {
  class ResizeObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  Object.defineProperty(globalThis, "ResizeObserver", { value: ResizeObserverStub, configurable: true });
  Object.defineProperty(window, "ResizeObserver", { value: ResizeObserverStub, configurable: true });
}
// Radix Popper 依赖 DOMRect.fromRect / scrollIntoView（jsdom 缺），补 no-op。
if (typeof (Element.prototype as any).scrollIntoView === "undefined") {
  (Element.prototype as any).scrollIntoView = () => {};
}
if (typeof (DOMRect as any).fromRect === "undefined") {
  (DOMRect as any).fromRect = ({ x = 0, y = 0, width = 0, height = 0 } = {}) =>
    ({ x, y, width, height, top: y, left: x, bottom: y + height, right: x + width, toJSON: () => ({}) });
}
