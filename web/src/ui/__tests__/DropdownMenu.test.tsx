import { describe, it, expect } from "vitest";
import * as UI from "../index.js";

describe("dropdown-menu exports", () => {
  it("exports DropdownMenu building blocks", () => {
    expect(UI.DropdownMenu).toBeDefined();
    expect(UI.DropdownMenuContent).toBeDefined();
    expect(UI.DropdownMenuItem).toBeDefined();
    expect(UI.DropdownMenuTrigger).toBeDefined();
  });
});
