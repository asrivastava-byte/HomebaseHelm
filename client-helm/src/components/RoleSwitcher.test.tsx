import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { PermissionContext } from "../lib/permissions";
import { RoleSwitcher } from "./RoleSwitcher";

const session = {
  role: "cs_t1_agent",
  permissions: ["account.view_user"],
  available_roles: ["cs_t1_agent", "cs_t2_escalations", "eng_super"],
};

describe("RoleSwitcher", () => {
  it("renders the current role and the available roles", () => {
    render(
      <PermissionContext.Provider value={session}>
        <RoleSwitcher />
      </PermissionContext.Provider>
    );
    fireEvent.mouseDown(screen.getByRole("combobox"));
    expect(screen.getByRole("option", { name: "cs_t2_escalations" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "eng_super" })).toBeInTheDocument();
  });

  it("writes the HELM_DEMO_ROLE cookie and reloads on selection", () => {
    const reload = vi.fn();
    Object.defineProperty(window, "location", { value: { reload }, writable: true });

    render(
      <PermissionContext.Provider value={session}>
        <RoleSwitcher />
      </PermissionContext.Provider>
    );
    fireEvent.mouseDown(screen.getByRole("combobox"));
    fireEvent.click(screen.getByRole("option", { name: "eng_super" }));

    expect(document.cookie).toContain("HELM_DEMO_ROLE=eng_super");
    expect(reload).toHaveBeenCalled();
  });
});
