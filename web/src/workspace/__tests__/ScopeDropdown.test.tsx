import { render } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { useRef } from "react";
import { ScopeDropdown } from "../ScopeDropdown.js";

vi.mock("../Icons.js", () => ({ IconLibrary: () => <span data-testid="ico" /> }));

const docs = [{ id: "d1", title: "Doc A" }, { id: "d2", title: "Doc B" }];

function Harness({ open }: { open: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  return (
    <ScopeDropdown
      anchorRef={ref}
      open={open}
      onToggle={() => {}}
      docs={docs}
      scopeDocIds={null}
      onToggleDoc={() => {}}
      onSelectAll={() => {}}
    />
  );
}

describe("ScopeDropdown", () => {
  it("portal menu absent when closed", () => {
    render(<Harness open={false} />);
    expect(document.body.querySelector(".ws-scope-portal")).toBeNull();
  });

  it("portal menu present with position:fixed in body when open", () => {
    render(<Harness open={true} />);
    const portal = document.body.querySelector(".ws-scope-portal") as HTMLElement;
    expect(portal).toBeTruthy();
    expect(portal.style.position).toBe("fixed");
    expect(portal.textContent).toContain("Doc A");
    expect(portal.textContent).toContain("Doc B");
  });
});
