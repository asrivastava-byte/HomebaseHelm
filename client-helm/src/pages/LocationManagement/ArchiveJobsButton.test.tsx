import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ArchiveJobsButton } from "./ArchiveJobsButton";

function wrap(ui: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{ui}</QueryClientProvider>;
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
  vi.stubGlobal("confirm", vi.fn(() => true));
});

describe("ArchiveJobsButton", () => {
  it("calls archive endpoint and reports result on confirm", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ archived_job_count: 17, archived_at: "2026-06-09T17:00:00Z" }),
    } as Response);

    const onSuccess = vi.fn();
    render(wrap(<ArchiveJobsButton locationId={42} onSuccess={onSuccess} />));
    fireEvent.click(screen.getByRole("button", { name: /archive jobs/i }));

    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
    expect(onSuccess.mock.calls[0][0]).toMatchObject({ archived_job_count: 17 });
  });

  it("does NOT call fetch if confirm is cancelled", () => {
    (confirm as ReturnType<typeof vi.fn>).mockReturnValueOnce(false);
    render(wrap(<ArchiveJobsButton locationId={42} onSuccess={() => {}} />));
    fireEvent.click(screen.getByRole("button", { name: /archive jobs/i }));
    expect(fetch).not.toHaveBeenCalled();
  });
});
