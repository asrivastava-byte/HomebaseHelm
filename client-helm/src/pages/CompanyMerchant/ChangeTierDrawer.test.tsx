import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ChangeTierDrawer } from "./ChangeTierDrawer";

function wrap(ui: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{ui}</QueryClientProvider>;
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});

describe("ChangeTierDrawer", () => {
  it("submits the chosen tier and reports success", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ from_tier: "starter", to_tier: "professional", effective_at: "now" }),
    } as Response);

    const onSuccess = vi.fn();
    render(wrap(<ChangeTierDrawer open companyId={42} currentTier="starter" onClose={() => {}} onSuccess={onSuccess} />));

    fireEvent.mouseDown(screen.getByRole("combobox"));
    fireEvent.click(screen.getByRole("option", { name: "professional" }));

    const applyBtn = screen.getByRole("button", { name: /apply/i });
    await waitFor(() => expect(applyBtn).not.toBeDisabled());
    fireEvent.click(applyBtn);

    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
    expect(onSuccess.mock.calls[0][0]).toMatchObject({ from_tier: "starter", to_tier: "professional" });
  });

  it("does nothing when cancel is clicked", () => {
    const onClose = vi.fn();
    render(wrap(<ChangeTierDrawer open companyId={42} currentTier="starter" onClose={onClose} onSuccess={() => {}} />));
    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));
    expect(onClose).toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });
});
