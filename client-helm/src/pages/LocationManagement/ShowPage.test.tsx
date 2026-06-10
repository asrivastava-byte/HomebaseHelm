import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { PermissionContext } from "../../lib/permissions";
import { LocationManagementShowPage } from "./ShowPage";

function wrap(ui: React.ReactNode, role: string, permissions: string[]) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={client}>
      <PermissionContext.Provider value={{ role, permissions, available_roles: [] }}>
        <MemoryRouter initialEntries={["/locations/42"]}>
          <Routes>
            <Route path="/locations/:id" element={ui} />
          </Routes>
        </MemoryRouter>
      </PermissionContext.Provider>
    </QueryClientProvider>
  );
}

const detail = {
  id: 42,
  name: "Main Street",
  company_id: 42,
  address: "123 Main St",
  tier: "starter",
  partner_name: "Square POS",
  job_count: 14,
  archived_job_count: 3,
  created_at: "2026-06-09T00:00:00Z",
  users: [
    { id: 101, name: "Alex Park", email: "alex@acme.dev", role_at_location: "cashier" },
  ],
  _redacted: [],
};

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});

describe("LocationManagementShowPage", () => {
  it("renders the location name + new detail fields", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, json: async () => detail } as Response);
    render(wrap(<LocationManagementShowPage />, "cs_t1_agent", ["account.view_location"]));
    await waitFor(() => expect(screen.getByText("Main Street")).toBeInTheDocument());
    expect(screen.getByText("123 Main St")).toBeInTheDocument();
    expect(screen.getAllByText("Square POS").length).toBeGreaterThan(0);
    expect(screen.getByText("Alex Park")).toBeInTheDocument();
  });

  it("hides Archive/Unarchive/Impersonate for cs_t1_agent", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, json: async () => detail } as Response);
    render(wrap(<LocationManagementShowPage />, "cs_t1_agent", ["account.view_location"]));
    await waitFor(() => expect(screen.getByText("Main Street")).toBeInTheDocument());
    expect(screen.queryByRole("button", { name: /^archive jobs$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^unarchive jobs$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /impersonate/i })).not.toBeInTheDocument();
  });

  it("shows Archive + Unarchive for eng_super", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, json: async () => detail } as Response);
    render(wrap(<LocationManagementShowPage />, "eng_super",
      ["account.view_location", "account.archive_location_jobs"]));
    await waitFor(() => expect(screen.getByText("Main Street")).toBeInTheDocument());
    expect(screen.getByRole("button", { name: /^archive jobs$/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^unarchive jobs$/i })).toBeInTheDocument();
  });

  it("shows per-user Impersonate when role has account.impersonate_user", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, json: async () => detail } as Response);
    render(wrap(<LocationManagementShowPage />, "cs_t2_escalations",
      ["account.view_location", "account.impersonate_user"]));
    await waitFor(() => expect(screen.getByText("Alex Park")).toBeInTheDocument());
    expect(screen.getByRole("button", { name: /impersonate/i })).toBeInTheDocument();
  });
});
