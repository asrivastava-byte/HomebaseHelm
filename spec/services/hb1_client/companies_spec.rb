require "rails_helper"

RSpec.describe Hb1Client::Companies do
  before do
    ENV["HB1_API_BASE_URL"] = "https://hb1.test"
    ENV["HB1_API_TOKEN"]    = "test-token"
  end

  describe ".show" do
    it "GETs /api/rpa_api/v1/companies/:id" do
      stub_request(:get, "https://hb1.test/api/rpa_api/v1/companies/42")
        .to_return(status: 200, body: { id: 42 }.to_json,
                   headers: { "Content-Type" => "application/json" })
      expect(described_class.show(42)).to eq("id" => 42)
    end
  end

  describe ".search" do
    it "GETs /api/rpa_api/v1/companies with q" do
      stub_request(:get, "https://hb1.test/api/rpa_api/v1/companies")
        .with(query: { q: "demo" })
        .to_return(status: 200, body: [{ id: 1 }].to_json,
                   headers: { "Content-Type" => "application/json" })
      expect(described_class.search("demo")).to eq([{ "id" => 1 }])
    end
  end

  describe ".merchant_profile" do
    it "GETs the composite merchant profile" do
      stub_request(:get, "https://hb1.test/api/rpa_api/v1/companies/42/merchant_profile")
        .to_return(status: 200,
                   body: { tier: "professional", billing_state: "active" }.to_json,
                   headers: { "Content-Type" => "application/json" })
      expect(described_class.merchant_profile(42))
        .to eq("tier" => "professional", "billing_state" => "active")
    end
  end

  describe ".change_billing_tier" do
    it "POSTs with to_tier in the body" do
      stub_request(:post, "https://hb1.test/api/rpa_api/v1/companies/42/billing_tier")
        .with(body: { to_tier: "professional" }.to_json)
        .to_return(status: 201,
                   body: { from_tier: "starter", to_tier: "professional", effective_at: "now" }.to_json,
                   headers: { "Content-Type" => "application/json" })
      expect(described_class.change_billing_tier(42, to_tier: "professional"))
        .to eq("from_tier" => "starter", "to_tier" => "professional", "effective_at" => "now")
    end
  end
end
