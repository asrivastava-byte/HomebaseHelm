require "rails_helper"

RSpec.describe "Helm UsersApi" do
  let(:base) { "/helm_api/v1/users" }
  let(:hb1_show) do
    {
      "id" => 42, "email" => "u@h.com", "full_name" => "Jane Doe",
      "phone" => "+15555550123", "ssn_last4" => "1234", "bank_last4" => "5678",
      "created_at" => "2025-01-01T00:00:00Z", "last_sign_in_at" => "2026-06-08T10:00:00Z",
      "stytch_subject" => "stytch-user-abc"
    }
  end

  before do
    ENV["HB1_API_BASE_URL"] = "https://hb1.test"
    ENV["HB1_API_TOKEN"]    = "test-token"
    AdminUser.find_or_create_by!(email: "cs_t1_agent@helm.local") do |u|
      u.full_name = "CS T1"; u.role = "cs_t1_agent"
    end
    AdminUser.find_or_create_by!(email: "cs_t2_payroll@helm.local") do |u|
      u.full_name = "CS T2 Payroll"; u.role = "cs_t2_payroll"
    end
    AdminUser.find_or_create_by!(email: "cs_t2_escalations@helm.local") do |u|
      u.full_name = "CS T2 Esc"; u.role = "cs_t2_escalations"
    end
    AdminUser.find_or_create_by!(email: "cs_t3_ops@helm.local") do |u|
      u.full_name = "CS T3 Ops"; u.role = "cs_t3_ops"
    end
  end

  describe "GET /helm_api/v1/users/:id" do
    before do
      stub_request(:get, "https://hb1.test/api/rpa_api/v1/users/42")
        .to_return(status: 200, body: hb1_show.to_json,
                   headers: { "Content-Type" => "application/json" })
    end

    it "omits PII fields for cs_t1_agent" do
      get "#{base}/42", headers: { "Cookie" => "HELM_DEMO_ROLE=cs_t1_agent" }
      body = JSON.parse(response.body)
      expect(response).to have_http_status(200)
      expect(body).not_to have_key("phone")
      expect(body["_redacted"]).to match_array(%w[phone ssn_last4 bank_last4])
    end

    it "exposes PII fields for cs_t2_payroll" do
      get "#{base}/42", headers: { "Cookie" => "HELM_DEMO_ROLE=cs_t2_payroll" }
      body = JSON.parse(response.body)
      expect(body["phone"]).to eq("+15555550123")
      expect(body["_redacted"]).to eq([])
    end
  end

  describe "GET /helm_api/v1/users?q=" do
    it "returns matching results for q" do
      stub_request(:get, "https://hb1.test/api/rpa_api/v1/users")
        .with(query: { q: "jane" })
        .to_return(status: 200,
                   body: [{ id: 1, email: "jane@h.com", full_name: "Jane Doe" }].to_json,
                   headers: { "Content-Type" => "application/json" })

      get "#{base}?q=jane", headers: { "Cookie" => "HELM_DEMO_ROLE=cs_t1_agent" }
      body = JSON.parse(response.body)
      expect(body.length).to eq(1)
      expect(body.first["email"]).to eq("jane@h.com")
    end
  end

  describe "POST /helm_api/v1/users/:id/verification_sms" do
    let(:hb1_result) { { "sent_at" => "2026-06-09T17:00:00Z", "provider_request_id" => "twilio-msg-xyz" } }

    it "403s for cs_t3_ops (lacks verify_phone)" do
      post "#{base}/42/verification_sms", headers: { "Cookie" => "HELM_DEMO_ROLE=cs_t3_ops" }
      expect(response).to have_http_status(403)
    end

    it "200s for cs_t1_agent and writes one audit event" do
      stub_request(:post, "https://hb1.test/api/rpa_api/v1/users/42/verification_sms")
        .to_return(status: 201, body: hb1_result.to_json,
                   headers: { "Content-Type" => "application/json" })

      expect {
        post "#{base}/42/verification_sms", headers: { "Cookie" => "HELM_DEMO_ROLE=cs_t1_agent" }
      }.to change(AuditEvent, :count).by(1)

      expect(response).to have_http_status(:ok).or have_http_status(:created)
      body = JSON.parse(response.body)
      expect(body).to eq("sent_at" => "2026-06-09T17:00:00Z", "provider_request_id" => "twilio-msg-xyz")
      event = AuditEvent.last
      expect(event.action).to        eq("user.verification_sms_sent")
      expect(event.resource_type).to eq("User")
      expect(event.resource_id).to   eq(42)
    end
  end

  describe "POST /helm_api/v1/users/:id/impersonate" do
    let(:hb1_token) { { "url" => "https://hb1.local/login_as/abc", "expires_at" => "2026-06-09T17:10:00Z" } }

    it "403s for cs_t1_agent" do
      post "#{base}/42/impersonate", headers: { "Cookie" => "HELM_DEMO_ROLE=cs_t1_agent" }
      expect(response).to have_http_status(403)
    end

    it "200s for cs_t2_escalations and writes one audit event tagged user.impersonation_started" do
      stub_request(:post, "https://hb1.test/api/rpa_api/v1/users/42/impersonation_token")
        .to_return(status: 201, body: hb1_token.to_json,
                   headers: { "Content-Type" => "application/json" })

      expect {
        post "#{base}/42/impersonate", headers: { "Cookie" => "HELM_DEMO_ROLE=cs_t2_escalations" }
      }.to change(AuditEvent, :count).by(1)

      expect(response).to have_http_status(:ok).or have_http_status(:created)
      body = JSON.parse(response.body)
      expect(body).to eq("url" => "https://hb1.local/login_as/abc", "expires_at" => "2026-06-09T17:10:00Z")
      event = AuditEvent.last
      expect(event.action).to        eq("user.impersonation_started")
      expect(event.resource_type).to eq("User")
      expect(event.resource_id).to   eq(42)
    end
  end
end
