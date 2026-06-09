require "rails_helper"

RSpec.describe Entities::ImpersonationToken do
  it "passes through url and expires_at" do
    json = described_class.represent(
      { "url" => "https://hb1.local/login_as/abc", "expires_at" => "2026-06-09T17:10:00Z" }
    ).serializable_hash
    expect(json).to eq(url: "https://hb1.local/login_as/abc", expires_at: "2026-06-09T17:10:00Z")
  end
end
