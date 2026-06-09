require "rails_helper"

RSpec.describe Entities::VerificationResult do
  it "passes through sent_at and provider_request_id" do
    json = described_class.represent(
      { "sent_at" => "2026-06-09T17:00:00Z", "provider_request_id" => "twilio-msg-xyz" }
    ).serializable_hash
    expect(json).to eq(sent_at: "2026-06-09T17:00:00Z", provider_request_id: "twilio-msg-xyz")
  end
end
