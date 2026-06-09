import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { LocationManagementIndexPage } from "./IndexPage";

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

describe("LocationManagementIndexPage", () => {
  it("renders search results from the API", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => [{ id: 1, name: "Demo" }],
    } as Response);

    render(wrap(<LocationManagementIndexPage />));
    fireEvent.change(screen.getByLabelText(/search/i), { target: { value: "demo" } });

    await waitFor(() => expect(screen.getByText("Demo")).toBeInTheDocument());
  });
});
