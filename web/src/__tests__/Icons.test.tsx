import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { IconSearch, IconPlus, IconNote, IconSend, IconTrash } from "../Icons.js";

describe("Icons lucide re-export", () => {
  it("renders SVG with lucide class and size attr", () => {
    const { container } = render(<IconSearch size={16} />);
    const svg = container.querySelector("svg");
    expect(svg).toBeTruthy();
    expect(svg?.getAttribute("width")).toBe("16");
    // lucide-react 给 svg 加 class="lucide ..."
    expect(svg?.getAttribute("class") || "").toMatch(/lucide/);
  });

  it("preserves Icon* API names", () => {
    const { container } = render(
      <>
        <IconPlus size={14} />
        <IconNote size={14} />
        <IconSend size={14} />
        <IconTrash size={14} />
      </>
    );
    expect(container.querySelectorAll("svg")).toHaveLength(4);
  });
});
