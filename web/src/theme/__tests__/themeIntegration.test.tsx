import { render, screen } from "@testing-library/react";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { WorkspaceProvider } from "../../workspace/WorkspaceStore.js";
import { WorkspaceShell } from "../../workspace/WorkspaceShell.js";
import { applyTheme } from "../useTheme.js";

vi.mock("../../api.js", () => ({ getToken: () => "t" }));
vi.mock("../../workspace/layout/WorkspaceLayout.js", () => ({
  WorkspaceLayout: ({ topbar }: any) => <div data-testid="layout">{topbar}</div>,
}));
vi.mock("../../workspace/CommandPalette.js", () => ({ CommandPalette: () => null }));

describe("theme integration", () => {
  beforeEach(() => {
    applyTheme("light");
  });

  it("TV1: default theme is light on shell", () => {
    render(
      <WorkspaceProvider>
        <WorkspaceShell user={{ email: "a@b.c" }} onOpenSettings={() => {}} />
      </WorkspaceProvider>
    );
    expect(document.documentElement.dataset.theme).toBe("light");
    expect(screen.getByRole("button", { name: /切换主题/i })).toBeInTheDocument();
  });
});
