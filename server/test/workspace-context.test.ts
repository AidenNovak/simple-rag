import { buildSelectionContext } from "../src/rag/agent.js";

const block = buildSelectionContext(
  { docId: "d1", text: "unique phrase xyz", start: 0, end: 17 },
  "My Doc",
);

if (!block.includes("unique phrase xyz")) throw new Error("selection not in prompt");
if (!block.includes("My Doc")) throw new Error("doc title missing");
if (!block.includes("用户当前选区")) throw new Error("selection header missing");

console.log("workspace-context.test.ts: PASS");
