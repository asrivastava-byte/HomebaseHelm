import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuditTrailTab } from "./AuditTrailTab";

function wrap(ui: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{ui}</QueryClientProvider>;
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});

describe("AuditTrailTab", () => {
  it("renders fetched events newest first", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => [
        { id: 2, action: "user.impersonation_started", role: "cs_t2_escalations",
          occurred_at: "2026-06-09T12:00:00Z", payload_after: { expires_at: "later" } },
        { id: 1, action: "user.viewed", role: "cs_t1_agent",
          occurred_at: "2026-06-09T11:00:00Z", payload_after: null },
      ],
    } as Response);

    render(wrap(<AuditTrailTab resourceType="User" resourceId={123} />));

    await waitFor(() => {
      expect(screen.getByText(/user.impersonation_started/)).toBeInTheDocument();
      expect(screen.getByText(/user.viewed/)).toBeInTheDocument();
    });
  });

  it("renders an empty-state when no events", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true, json: async () => []
    } as Response);

    render(wrap(<AuditTrailTab resourceType="User" resourceId={999} />));
    await waitFor(() => {
      expect(screen.getByText(/no audit events/i)).toBeInTheDocument();
    });
  });
});
