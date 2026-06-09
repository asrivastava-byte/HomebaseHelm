import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { UserLookupIndexPage } from "./IndexPage";

function wrap(ui: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={client}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});

describe("UserLookupIndexPage", () => {
  it("renders search results from the API", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => [{ id: 1, email: "jane@h.com", full_name: "Jane Doe" }],
    } as Response);

    render(wrap(<UserLookupIndexPage />));
    fireEvent.change(screen.getByLabelText(/search/i), { target: { value: "jane" } });

    await waitFor(() => {
      expect(screen.getByText("jane@h.com")).toBeInTheDocument();
      expect(screen.getByText("Jane Doe")).toBeInTheDocument();
    });
  });

  it("renders 'no results' when search returns empty", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true, json: async () => []
    } as Response);

    render(wrap(<UserLookupIndexPage />));
    fireEvent.change(screen.getByLabelText(/search/i), { target: { value: "nobody" } });

    await waitFor(() => {
      expect(screen.getByText(/no results/i)).toBeInTheDocument();
    });
  });
});
