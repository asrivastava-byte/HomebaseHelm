require "rails_helper"

RSpec.describe Hb1Client::Users do
  before do
    ENV["HB1_API_BASE_URL"] = "https://hb1.test"
    ENV["HB1_API_TOKEN"]    = "test-token"
  end

  describe ".show" do
    it "GETs /api/rpa_api/v1/users/:id and returns the parsed body" do
      stub_request(:get, "https://hb1.test/api/rpa_api/v1/users/42")
        .to_return(status: 200, body: { id: 42, email: "u@h.com" }.to_json,
                   headers: { "Content-Type" => "application/json" })
      expect(described_class.show(42)).to eq("id" => 42, "email" => "u@h.com")
    end
  end

  describe ".search" do
    it "GETs /api/rpa_api/v1/users with the q param" do
      stub_request(:get, "https://hb1.test/api/rpa_api/v1/users")
        .with(query: { q: "jane" })
        .to_return(status: 200, body: [{ id: 1, email: "jane@h.com" }].to_json,
                   headers: { "Content-Type" => "application/json" })
      results = described_class.search("jane")
      expect(results).to eq([{ "id" => 1, "email" => "jane@h.com" }])
    end
  end

  describe ".send_verification_sms" do
    it "POSTs and returns the body" do
      stub_request(:post, "https://hb1.test/api/rpa_api/v1/users/42/verification_sms")
        .to_return(status: 201, body: { sent_at: "now", provider_request_id: "x" }.to_json,
                   headers: { "Content-Type" => "application/json" })
      expect(described_class.send_verification_sms(42))
        .to eq("sent_at" => "now", "provider_request_id" => "x")
    end
  end

  describe ".issue_impersonation_token" do
    it "POSTs and returns the body" do
      stub_request(:post, "https://hb1.test/api/rpa_api/v1/users/42/impersonation_token")
        .to_return(status: 201, body: { url: "https://hb1/login_as/x", expires_at: "later" }.to_json,
                   headers: { "Content-Type" => "application/json" })
      expect(described_class.issue_impersonation_token(42))
        .to eq("url" => "https://hb1/login_as/x", "expires_at" => "later")
    end
  end
end
