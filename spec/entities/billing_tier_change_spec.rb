require "rails_helper"

RSpec.describe Entities::BillingTierChange do
  it "exposes from_tier, to_tier, effective_at" do
    json = described_class.represent(
      { "from_tier" => "starter", "to_tier" => "professional", "effective_at" => "2026-06-09T17:00:00Z" }
    ).serializable_hash
    expect(json).to eq(from_tier: "starter", to_tier: "professional", effective_at: "2026-06-09T17:00:00Z")
  end
end
