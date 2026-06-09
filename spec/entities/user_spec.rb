require "rails_helper"

RSpec.describe Entities::User do
  let(:source) do
    {
      "id" => 123, "email" => "u@h.com", "full_name" => "Jane Doe",
      "phone" => "+15555550123", "ssn_last4" => "1234", "bank_last4" => "5678",
      "created_at" => "2025-01-01T00:00:00Z", "last_sign_in_at" => "2026-06-08T10:00:00Z",
      "stytch_subject" => "stytch-user-abc"
    }
  end

  def principal(role) = PermissionService::Principal.new(id: 1, role: role, stytch_subject: nil)

  it "omits PII fields and lists them in _redacted when role lacks account.view_pii" do
    json = described_class.represent(source, role: principal("cs_t1_agent")).serializable_hash
    expect(json).not_to have_key(:phone)
    expect(json).not_to have_key(:ssn_last4)
    expect(json).not_to have_key(:bank_last4)
    expect(json[:_redacted]).to match_array(%w[phone ssn_last4 bank_last4])
  end

  it "includes PII fields and an empty _redacted when role has account.view_pii" do
    json = described_class.represent(source, role: principal("cs_t2_payments")).serializable_hash
    expect(json[:phone]).to eq("+15555550123")
    expect(json[:ssn_last4]).to eq("1234")
    expect(json[:bank_last4]).to eq("5678")
    expect(json[:_redacted]).to eq([])
  end

  it "always exposes non-PII fields" do
    json = described_class.represent(source, role: principal("cs_t1_agent")).serializable_hash
    expect(json).to include(
      id: 123, email: "u@h.com", full_name: "Jane Doe",
      stytch_subject: "stytch-user-abc"
    )
  end
end
