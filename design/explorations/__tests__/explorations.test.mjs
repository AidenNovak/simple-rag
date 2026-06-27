// design/explorations/__tests__/explorations.test.mjs — 静态结构 smoke
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import assert from "node:assert/strict";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const variants = ["variant-a-bear", "variant-b-youmind", "variant-c-apple", "variant-d-codex", "variant-e-inkwell"];

for (const v of variants) {
  test(`${v}.html exists and has taste comment + workspace`, () => {
    const p = resolve(root, `${v}.html`);
    assert.ok(existsSync(p), `${v}.html missing`);
    const html = readFileSync(p, "utf8");
    assert.match(html, /Variant [ABCDE]/, `${v} missing Variant comment`);
    assert.match(html, /ex-workspace/, `${v} missing ex-workspace`);
    assert.match(html, /随手记 · 真好/, `${v} missing fixture content`);
  });

  test(`${v}.css exists and ≤ 120 lines`, () => {
    const cssName = v.replace(/-(bear|youmind|apple|codex|inkwell)$/, "-$2");
    const p = resolve(root, `${v}.css`);
    assert.ok(existsSync(p), `${v}.css missing`);
    const css = readFileSync(p, "utf8");
    const lines = css.split("\n").length;
    assert.ok(lines <= 120, `${v}.css is ${lines} lines, must be ≤120`);
  });
}

test("index.html references all 5 variants", () => {
  const html = readFileSync(resolve(root, "index.html"), "utf8");
  for (const v of variants) assert.match(html, new RegExp(`${v}\\.html`), `index missing ${v}`);
});

test("_fixtures.html exists with shared content", () => {
  const p = resolve(root, "_fixtures.html");
  assert.ok(existsSync(p));
});

test("taste-constitution.md exists", () => {
  assert.ok(existsSync(resolve(root, "..", "taste-constitution.md")));
});
