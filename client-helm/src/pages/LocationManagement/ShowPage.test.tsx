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

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});

describe("LocationManagementShowPage", () => {
  it("renders the resource's basic fields", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ id: 42, name: "Demo", created_at: "2026-06-09T00:00:00Z", _redacted: [] }),
    } as Response);

    render(wrap(<LocationManagementShowPage />, "cs_t1_agent", ["account.view_location"]));

    await waitFor(() => expect(screen.getByText("Demo")).toBeInTheDocument());
  });
});
