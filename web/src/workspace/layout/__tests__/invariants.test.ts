import { describe, it, expect, beforeEach } from "vitest";
import { assertPaneLayout, isComposerContained } from "../invariants.js";

describe("assertPaneLayout", () => {
  let root: HTMLDivElement;

  beforeEach(() => {
    document.body.innerHTML = "";
    root = document.createElement("div");
    root.className = "workspace-root";
    root.innerHTML = `
      <aside data-pane="left" style="position:absolute;left:0;top:0;width:200px;height:600px"></aside>
      <main data-pane="center" style="position:absolute;left:204px;top:0;width:400px;height:600px"></main>
      <aside data-pane="right" style="position:absolute;left:608px;top:0;width:300px;height:600px"></aside>
    `;
    document.body.appendChild(root);
    // jsdom 无 layout engine，用 getBoundingClientRect mock
    for (const el of root.querySelectorAll("[data-pane]")) {
      const pane = el as HTMLElement;
      const left = pane.dataset.pane === "left" ? 0 : pane.dataset.pane === "center" ? 204 : 608;
      const width = pane.dataset.pane === "center" ? 400 : pane.dataset.pane === "left" ? 200 : 300;
      pane.getBoundingClientRect = () =>
        ({ left, right: left + width, top: 0, bottom: 600, width, height: 600, x: left, y: 0, toJSON: () => ({}) }) as DOMRect;
    }
  });

  it("passes when panes are ordered left-center-right", () => {
    const r = assertPaneLayout(root);
    expect(r.ok).toBe(true);
    expect(r.errors).toEqual([]);
  });

  it("fails when center is left of left pane", () => {
    const center = root.querySelector('[data-pane="center"]') as HTMLElement;
    center.getBoundingClientRect = () =>
      ({ left: 0, right: 100, top: 0, bottom: 600, width: 100, height: 600, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;
    const r = assertPaneLayout(root);
    expect(r.ok).toBe(false);
    expect(r.errors.length).toBeGreaterThan(0);
  });
});

describe("isComposerContained", () => {
  it("returns true when composer inside chat pane", () => {
    const chat = document.createElement("div");
    chat.getBoundingClientRect = () =>
      ({ left: 600, right: 900, top: 0, bottom: 800, width: 300, height: 800, x: 600, y: 0, toJSON: () => ({}) }) as DOMRect;
    const composer = document.createElement("div");
    composer.getBoundingClientRect = () =>
      ({ left: 610, right: 890, top: 700, bottom: 780, width: 280, height: 80, x: 610, y: 700, toJSON: () => ({}) }) as DOMRect;
    expect(isComposerContained(chat, composer)).toBe(true);
  });

  it("returns false when composer escapes right pane", () => {
    const chat = document.createElement("div");
    chat.getBoundingClientRect = () =>
      ({ left: 600, right: 900, top: 0, bottom: 800, width: 300, height: 800, x: 600, y: 0, toJSON: () => ({}) }) as DOMRect;
    const composer = document.createElement("div");
    composer.getBoundingClientRect = () =>
      ({ left: 0, right: 1400, top: 700, bottom: 780, width: 1400, height: 80, x: 0, y: 700, toJSON: () => ({}) }) as DOMRect;
    expect(isComposerContained(chat, composer)).toBe(false);
  });
});
