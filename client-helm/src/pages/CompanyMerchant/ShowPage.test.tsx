import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { PermissionContext } from "../../lib/permissions";
import { CompanyMerchantShowPage } from "./ShowPage";

function wrap(ui: React.ReactNode, role: string, permissions: string[]) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={client}>
      <PermissionContext.Provider value={{ role, permissions, available_roles: [] }}>
        <MemoryRouter initialEntries={["/companies/42"]}>
          <Routes>
            <Route path="/companies/:id" element={ui} />
          </Routes>
        </MemoryRouter>
      </PermissionContext.Provider>
    </QueryClientProvider>
  );
}

const detail = {
  id: 42, name: "Acme", tier: "starter", owner_user_id: 99,
  created_at: "2026-06-09T00:00:00Z",
  subscription: { status: "active", started_at: "2025-01-01T00:00:00Z", renews_at: "2026-07-01T00:00:00Z" },
  locations: [{ id: 42, name: "Acme — Main" }],
  payment_attempts: [],
  _redacted: ["stripe_customer_id"]
};

const profile = {
  tier: "starter", billing_state: "active",
  subscription_started_at: "2025-01-01T00:00:00Z",
  subscription_renews_at:  "2026-07-01T00:00:00Z",
  check_entity_id: 17,
  check_entity: { id: 17, name: "Acme LLC", ein_last4: "9281", status: "verified" },
  payroll_readiness: "ready",
  missing_data_flags: [],
  recent_invoices: [],
  _redacted: ["payment_method"]
};

function mockEndpoints(detailBody: object, profileBody: object) {
  (fetch as ReturnType<typeof vi.fn>).mockImplementation((url: string) => {
    if (url.endsWith("/merchant_profile")) {
      return Promise.resolve({ ok: true, json: async () => profileBody } as Response);
    }
    if (url.endsWith("/sales_tax")) {
      return Promise.resolve({ ok: true, json: async () => ({
        company_id: 42, aggregate_tax_collected_cents: 184200,
        per_location: [], exemptions: []
      }) } as Response);
    }
    if (url.endsWith("/biller")) {
      return Promise.resolve({ ok: true, json: async () => ({
        company_id: 42, locations: [], credit_cards: [], tier_history: [], _redacted: []
      }) } as Response);
    }
    return Promise.resolve({ ok: true, json: async () => detailBody } as Response);
  });
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});

describe("CompanyMerchantShowPage", () => {
  it("renders company name, tier, payroll readiness, and merchant profile", async () => {
    mockEndpoints(detail, profile);
    render(wrap(<CompanyMerchantShowPage />, "cs_t1_agent",
      ["account.view_company", "account.view_merchant_profile"]));

    await waitFor(() => expect(screen.getByText("Acme")).toBeInTheDocument());
    expect(screen.getAllByText(/starter/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/ready/i).length).toBeGreaterThan(0);
  });

  it("hides Change tier and Sales tax/Biller tabs for cs_t1_agent", async () => {
    mockEndpoints(detail, profile);
    render(wrap(<CompanyMerchantShowPage />, "cs_t1_agent",
      ["account.view_company", "account.view_merchant_profile"]));

    await waitFor(() => expect(screen.getByText("Acme")).toBeInTheDocument());
    expect(screen.queryByRole("button", { name: /change tier/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: /sales tax/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: /biller/i })).not.toBeInTheDocument();
  });

  it("shows Change tier + Sales tax + Biller tabs for cs_t2_payments", async () => {
    mockEndpoints(detail, profile);
    render(wrap(<CompanyMerchantShowPage />, "cs_t2_payments",
      ["account.view_company", "account.view_merchant_profile",
       "account.view_sales_tax", "account.view_biller",
       "billing.update_subscription_tier"]));

    await waitFor(() => expect(screen.getByText("Acme")).toBeInTheDocument());
    expect(screen.getByRole("button", { name: /change tier/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /sales tax/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /biller/i })).toBeInTheDocument();
  });
});
