require "rails_helper"

RSpec.describe "Helm CompaniesApi" do
  let(:base) { "/helm_api/v1/companies" }

  before do
    ENV["HB1_API_BASE_URL"] = "https://hb1.test"
    ENV["HB1_API_TOKEN"]    = "test-token"
    AdminUser.find_or_create_by!(email: "cs_t1_agent@helm.local") do |u|
      u.full_name = "CS T1"; u.role = "cs_t1_agent"
    end
  end

  describe "GET /helm_api/v1/companies/:id" do
    it "returns the object for a role with account.view_company" do
      stub_request(:get, "https://hb1.test/api/rpa_api/v1/companies/42")
        .to_return(status: 200, body: { id: 42, name: "Demo" }.to_json,
                   headers: { "Content-Type" => "application/json" })

      get "#{base}/42", headers: { "Cookie" => "HELM_DEMO_ROLE=cs_t1_agent" }
      expect(response).to have_http_status(200)
      body = JSON.parse(response.body)
      expect(body["id"]).to   eq(42)
      expect(body["name"]).to eq("Demo")
    end
  end

  describe "GET /helm_api/v1/companies?q=" do
    it "returns the search results" do
      stub_request(:get, "https://hb1.test/api/rpa_api/v1/companies")
        .with(query: { q: "demo" })
        .to_return(status: 200, body: [{ id: 1, name: "Demo" }].to_json,
                   headers: { "Content-Type" => "application/json" })

      get "#{base}?q=demo", headers: { "Cookie" => "HELM_DEMO_ROLE=cs_t1_agent" }
      expect(JSON.parse(response.body).length).to eq(1)
    end
  end

  describe "GET /helm_api/v1/companies/:id/merchant_profile" do
    let(:hb1_profile) do
      {
        "tier" => "professional", "billing_state" => "active",
        "subscription_started_at" => "2025-01-01T00:00:00Z",
        "subscription_renews_at"  => "2026-07-01T00:00:00Z",
        "payment_method" => { "last4" => "4242", "brand" => "visa" },
        "check_entity_id" => 17, "recent_invoices" => []
      }
    end

    before do
      stub_request(:get, "https://hb1.test/api/rpa_api/v1/companies/42/merchant_profile")
        .to_return(status: 200, body: hb1_profile.to_json,
                   headers: { "Content-Type" => "application/json" })
    end

    it "redacts payment_method for cs_t1_agent" do
      get "#{base}/42/merchant_profile", headers: { "Cookie" => "HELM_DEMO_ROLE=cs_t1_agent" }
      body = JSON.parse(response.body)
      expect(response).to have_http_status(200)
      expect(body).not_to have_key("payment_method")
    end

    it "exposes payment_method for cs_t2_payments" do
      AdminUser.find_or_create_by!(email: "cs_t2_payments@helm.local") do |u|
        u.full_name = "CS T2 Payments"; u.role = "cs_t2_payments"
      end
      get "#{base}/42/merchant_profile", headers: { "Cookie" => "HELM_DEMO_ROLE=cs_t2_payments" }
      body = JSON.parse(response.body)
      expect(body["payment_method"]).to eq("last4" => "4242", "brand" => "visa")
    end
  end

  describe "POST /helm_api/v1/companies/:id/billing_tier" do
    let(:hb1_change) { { "from_tier" => "starter", "to_tier" => "professional", "effective_at" => "2026-06-09T17:00:00Z" } }

    before do
      AdminUser.find_or_create_by!(email: "cs_t2_payments@helm.local") do |u|
        u.full_name = "CS T2 Payments"; u.role = "cs_t2_payments"
      end
    end

    it "403s for cs_t1_agent (lacks billing.update_subscription_tier)" do
      post "#{base}/42/billing_tier",
           params: { to_tier: "professional" },
           headers: { "Cookie" => "HELM_DEMO_ROLE=cs_t1_agent" }
      expect(response).to have_http_status(403)
    end

    it "200s for cs_t2_payments and writes one audit event with payload_before + payload_after" do
      stub_request(:get, "https://hb1.test/api/rpa_api/v1/companies/42")
        .to_return(status: 200, body: { id: 42, name: "Acme", tier: "starter" }.to_json,
                   headers: { "Content-Type" => "application/json" })
      stub_request(:post, "https://hb1.test/api/rpa_api/v1/companies/42/billing_tier")
        .with(body: { to_tier: "professional" }.to_json)
        .to_return(status: 201, body: hb1_change.to_json,
                   headers: { "Content-Type" => "application/json" })

      expect {
        post "#{base}/42/billing_tier",
             params: { to_tier: "professional" },
             headers: { "Cookie" => "HELM_DEMO_ROLE=cs_t2_payments" }
      }.to change(AuditEvent, :count).by(1)

      expect(response).to have_http_status(:ok).or have_http_status(:created)
      event = AuditEvent.last
      expect(event.action).to         eq("company.billing_tier_changed")
      expect(event.payload_before).to eq("tier" => "starter")
      expect(event.payload_after).to  eq("tier" => "professional")
    end
  end
end
