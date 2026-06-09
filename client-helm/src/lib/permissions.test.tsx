import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { PermissionContext, usePermission } from "./permissions";

function Probe({ permKey }: { permKey: string }) {
  const allowed = usePermission(permKey);
  return <span>{allowed ? "yes" : "no"}</span>;
}

describe("usePermission", () => {
  it("returns true for exact match", () => {
    render(
      <PermissionContext.Provider
        value={{ role: "cs_t1_agent", permissions: ["account.view_user"], available_roles: [] }}
      >
        <Probe permKey="account.view_user" />
      </PermissionContext.Provider>
    );
    expect(screen.getByText("yes")).toBeInTheDocument();
  });

  it("returns false when missing", () => {
    render(
      <PermissionContext.Provider
        value={{ role: "cs_t1_agent", permissions: ["account.view_user"], available_roles: [] }}
      >
        <Probe permKey="account.impersonate_user" />
      </PermissionContext.Provider>
    );
    expect(screen.getByText("no")).toBeInTheDocument();
  });

  it("honors wildcard permissions", () => {
    render(
      <PermissionContext.Provider
        value={{ role: "eng_power", permissions: ["account.*"], available_roles: [] }}
      >
        <Probe permKey="account.impersonate_user" />
      </PermissionContext.Provider>
    );
    expect(screen.getByText("yes")).toBeInTheDocument();
  });
});
