require "rails_helper"

RSpec.describe Entities::Company do
  let(:source) do
    {
      "id" => 1, "name" => "Acme", "created_at" => "2026-06-09T00:00:00Z",
      "tier" => "professional", "owner_user_id" => 99,
      "stripe_customer_id" => "cus_abc"
    }
  end

  def principal(role) = PermissionService::Principal.new(id: 1, role: role, stytch_subject: nil)

  it "exposes the basic fields" do
    json = described_class.represent(source, role: principal("cs_t1_agent")).serializable_hash
    expect(json).to include(id: 1, name: "Acme", tier: "professional", owner_user_id: 99)
  end

  it "redacts stripe_customer_id for cs_t1_agent" do
    json = described_class.represent(source, role: principal("cs_t1_agent")).serializable_hash
    expect(json).not_to have_key(:stripe_customer_id)
    expect(json[:_redacted]).to include("stripe_customer_id")
  end

  it "exposes stripe_customer_id for cs_t2_payments" do
    json = described_class.represent(source, role: principal("cs_t2_payments")).serializable_hash
    expect(json[:stripe_customer_id]).to eq("cus_abc")
    expect(json[:_redacted]).to eq([])
  end
end
