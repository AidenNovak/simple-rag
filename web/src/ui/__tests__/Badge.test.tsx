import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { Badge } from "../badge.js";

describe("Badge", () => {
  it("renders pending without emoji", () => {
    render(<Badge variant="pending">处理中</Badge>);
    const el = screen.getByText("处理中");
    expect(el.className).toMatch(/ui-badge/);
    expect(el.textContent).not.toMatch(/⏳/);
  });

  it("applies failed variant", () => {
    render(<Badge variant="failed">失败</Badge>);
    expect(screen.getByText("失败")).toHaveAttribute("data-variant", "failed");
  });
});
