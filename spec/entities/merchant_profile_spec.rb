require "rails_helper"

RSpec.describe Entities::MerchantProfile do
  let(:source) do
    {
      "tier" => "professional",
      "billing_state" => "active",
      "subscription_started_at" => "2025-01-01T00:00:00Z",
      "subscription_renews_at"  => "2026-07-01T00:00:00Z",
      "payment_method" => { "last4" => "4242", "brand" => "visa" },
      "check_entity_id" => 17,
      "recent_invoices" => [
        { "id" => 1, "amount_cents" => 1999, "status" => "paid", "paid_at" => "2026-05-01T00:00:00Z" }
      ]
    }
  end

  def principal(role) = PermissionService::Principal.new(id: 1, role: role, stytch_subject: nil)

  it "exposes non-PII fields for cs_t1_agent" do
    json = described_class.represent(source, role: principal("cs_t1_agent")).serializable_hash
    expect(json[:tier]).to            eq("professional")
    expect(json[:billing_state]).to   eq("active")
    expect(json[:check_entity_id]).to eq(17)
    expect(json[:recent_invoices].first[:status]).to eq("paid")
  end

  it "redacts payment_method when role lacks account.view_pii" do
    json = described_class.represent(source, role: principal("cs_t1_agent")).serializable_hash
    expect(json).not_to have_key(:payment_method)
    expect(json[:_redacted]).to include("payment_method")
  end

  it "exposes payment_method for cs_t2_payments" do
    json = described_class.represent(source, role: principal("cs_t2_payments")).serializable_hash
    expect(json[:payment_method]).to eq(last4: "4242", brand: "visa")
    expect(json[:_redacted]).to eq([])
  end
end
