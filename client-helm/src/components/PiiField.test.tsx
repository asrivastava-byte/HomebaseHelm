import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { PiiField } from "./PiiField";

describe("PiiField", () => {
  it("renders the value when not redacted", () => {
    render(<PiiField name="phone" value="555-1234" redactedFields={[]} />);
    expect(screen.getByText("555-1234")).toBeInTheDocument();
  });

  it("renders masked placeholder when redacted", () => {
    render(<PiiField name="phone" value={null} redactedFields={["phone"]} />);
    expect(screen.getByText(/••••/)).toBeInTheDocument();
  });

  it("renders masked with suffix if a suffix is provided", () => {
    render(<PiiField name="ssn_last4" value={null} suffix="6789" redactedFields={["ssn_last4"]} />);
    expect(screen.getByText("•••••• 6789")).toBeInTheDocument();
  });
});
