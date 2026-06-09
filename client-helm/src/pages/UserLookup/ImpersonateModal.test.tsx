import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ImpersonateModal } from "./ImpersonateModal";

function wrap(ui: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{ui}</QueryClientProvider>;
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
  vi.stubGlobal("open", vi.fn());
});

describe("ImpersonateModal", () => {
  it("POSTs and opens the returned URL in a new tab on confirm", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ url: "https://hb1.local/login_as/abc", expires_at: "soon" }),
    } as Response);

    const onSuccess = vi.fn();
    render(wrap(<ImpersonateModal open onClose={() => {}} userId={42} onSuccess={onSuccess} />));

    fireEvent.click(screen.getByRole("button", { name: /confirm/i }));

    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
    expect(window.open).toHaveBeenCalledWith("https://hb1.local/login_as/abc", "_blank");
  });

  it("does nothing when cancel is clicked", () => {
    const onClose = vi.fn();
    render(wrap(<ImpersonateModal open onClose={onClose} userId={42} onSuccess={() => {}} />));
    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));
    expect(onClose).toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });
});
