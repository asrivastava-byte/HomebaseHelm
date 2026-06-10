import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { PermissionContext } from "../../lib/permissions";
import { UserLookupShowPage } from "./ShowPage";

function wrap(ui: React.ReactNode, role: string, permissions: string[]) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={client}>
      <PermissionContext.Provider value={{ role, permissions, available_roles: [] }}>
        <MemoryRouter initialEntries={["/users/42"]}>
          <Routes>
            <Route path="/users/:id" element={ui} />
          </Routes>
        </MemoryRouter>
      </PermissionContext.Provider>
    </QueryClientProvider>
  );
}

const baseDetail = {
  id: 42, email: "jane@h.com", full_name: "Jane Doe",
  created_at: "2025-01-01T00:00:00Z", last_sign_in_at: "2026-06-08T10:00:00Z",
  stytch_subject: "stytch-x",
  mfa_status: "enabled",
  bank_account_present: true,
  memberships: [],
  jobs: [],
  _redacted: ["phone", "ssn_last4", "bank_last4"],
};

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});

describe("UserLookupShowPage", () => {
  it("hides PII and impersonate button for cs_t1_agent", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true, json: async () => baseDetail
    } as Response);
    render(wrap(<UserLookupShowPage />, "cs_t1_agent", ["account.view_user", "account.verify_phone"]));

    await waitFor(() => expect(screen.getAllByText("jane@h.com").length).toBeGreaterThan(0));
    expect(screen.queryByRole("button", { name: /impersonate/i })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /resend verification sms/i })).toBeInTheDocument();
  });

  it("shows impersonate button for cs_t2_escalations", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ ...baseDetail, phone: "+15555550123", ssn_last4: "1234", bank_last4: "5678", _redacted: [] })
    } as Response);

    render(wrap(<UserLookupShowPage />, "cs_t2_escalations",
      ["account.view_user", "account.view_pii", "account.verify_phone", "account.impersonate_user"]));

    await waitFor(() => expect(screen.getByText("+15555550123")).toBeInTheDocument());
    expect(screen.getByRole("button", { name: /impersonate/i })).toBeInTheDocument();
  });

  it("shows Edit + Resend verification email for cs_t2_payroll", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true, json: async () => baseDetail
    } as Response);
    render(wrap(<UserLookupShowPage />, "cs_t2_payroll",
      ["account.view_user", "account.edit_user", "account.resend_verification_email"]));

    await waitFor(() => expect(screen.getAllByText("jane@h.com").length).toBeGreaterThan(0));
    expect(screen.getByRole("button", { name: /edit user/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /resend verification email/i })).toBeInTheDocument();
  });
});
