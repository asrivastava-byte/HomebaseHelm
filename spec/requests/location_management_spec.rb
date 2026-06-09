require "rails_helper"

RSpec.describe "Helm LocationsApi" do
  let(:base) { "/helm_api/v1/locations" }

  before do
    ENV["HB1_API_BASE_URL"] = "https://hb1.test"
    ENV["HB1_API_TOKEN"]    = "test-token"
    AdminUser.find_or_create_by!(email: "cs_t1_agent@helm.local") do |u|
      u.full_name = "CS T1"; u.role = "cs_t1_agent"
    end
  end

  describe "GET /helm_api/v1/locations/:id" do
    it "returns the object for a role with account.view_location" do
      stub_request(:get, "https://hb1.test/api/rpa_api/v1/locations/42")
        .to_return(status: 200, body: { id: 42, name: "Demo" }.to_json,
                   headers: { "Content-Type" => "application/json" })

      get "#{base}/42", headers: { "Cookie" => "HELM_DEMO_ROLE=cs_t1_agent" }
      expect(response).to have_http_status(200)
      body = JSON.parse(response.body)
      expect(body["id"]).to   eq(42)
      expect(body["name"]).to eq("Demo")
    end
  end

  describe "GET /helm_api/v1/locations?q=" do
    it "returns the search results" do
      stub_request(:get, "https://hb1.test/api/rpa_api/v1/locations")
        .with(query: { q: "demo" })
        .to_return(status: 200, body: [{ id: 1, name: "Demo" }].to_json,
                   headers: { "Content-Type" => "application/json" })

      get "#{base}?q=demo", headers: { "Cookie" => "HELM_DEMO_ROLE=cs_t1_agent" }
      expect(JSON.parse(response.body).length).to eq(1)
    end
  end

  describe "POST /helm_api/v1/locations/:id/archive_jobs" do
    let(:hb1_result) { { "archived_job_count" => 17, "archived_at" => "2026-06-09T17:00:00Z" } }

    before do
      AdminUser.find_or_create_by!(email: "eng_super@helm.local") do |u|
        u.full_name = "Eng Super"; u.role = "eng_super"
      end
    end

    it "403s for cs_t1_agent (lacks archive_location_jobs)" do
      post "#{base}/42/archive_jobs", headers: { "Cookie" => "HELM_DEMO_ROLE=cs_t1_agent" }
      expect(response).to have_http_status(403)
    end

    it "200s for eng_super and writes one audit event with archived_job_count" do
      stub_request(:post, "https://hb1.test/api/rpa_api/v1/locations/42/archive_jobs")
        .to_return(status: 201, body: hb1_result.to_json,
                   headers: { "Content-Type" => "application/json" })

      expect {
        post "#{base}/42/archive_jobs", headers: { "Cookie" => "HELM_DEMO_ROLE=eng_super" }
      }.to change(AuditEvent, :count).by(1)

      expect(response).to have_http_status(:ok).or have_http_status(:created)
      body = JSON.parse(response.body)
      expect(body).to eq("archived_job_count" => 17, "archived_at" => "2026-06-09T17:00:00Z")

      event = AuditEvent.last
      expect(event.action).to        eq("location.jobs_archived")
      expect(event.payload_after).to eq("archived_job_count" => 17, "archived_at" => "2026-06-09T17:00:00Z")
    end
  end
end
