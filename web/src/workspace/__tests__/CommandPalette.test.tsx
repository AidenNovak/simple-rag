import { render } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { CommandPalette } from "../CommandPalette.js";

vi.mock("../../api.js", () => ({
  api: { search: vi.fn().mockResolvedValue({ results: [] }), getDoc: vi.fn() },
}));
vi.mock("../WorkspaceStore.js", () => ({
  useWorkspace: () => ({ dispatch: vi.fn(), state: {} }),
}));
vi.mock("../../components/Toast.js", () => ({ useToast: () => vi.fn() }));

describe("CommandPalette", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("UV3: opens with cmdk root", async () => {
    const user = userEvent.setup();
    render(<CommandPalette />);
    await user.keyboard("{Meta>}k{/Meta}");
    expect(document.querySelector("[cmdk-root]")).toBeTruthy();
  });
});
