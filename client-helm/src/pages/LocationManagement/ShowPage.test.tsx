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

const detail = { id: 42, name: "Main Street", created_at: "2026-06-09T00:00:00Z", _redacted: [] };

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});

describe("LocationManagementShowPage", () => {
  it("renders the location name", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, json: async () => detail } as Response);
    render(wrap(<LocationManagementShowPage />, "cs_t1_agent", ["account.view_location"]));
    await waitFor(() => expect(screen.getByText("Main Street")).toBeInTheDocument());
  });

  it("hides Archive jobs for cs_t1_agent", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, json: async () => detail } as Response);
    render(wrap(<LocationManagementShowPage />, "cs_t1_agent", ["account.view_location"]));
    await waitFor(() => expect(screen.getByText("Main Street")).toBeInTheDocument());
    expect(screen.queryByRole("button", { name: /archive jobs/i })).not.toBeInTheDocument();
  });

  it("shows Archive jobs for eng_super", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, json: async () => detail } as Response);
    render(wrap(<LocationManagementShowPage />, "eng_super",
      ["account.view_location", "account.archive_location_jobs"]));
    await waitFor(() => expect(screen.getByText("Main Street")).toBeInTheDocument());
    expect(screen.getByRole("button", { name: /archive jobs/i })).toBeInTheDocument();
  });
});
