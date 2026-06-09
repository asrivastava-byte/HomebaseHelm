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

  # Add a permission-denial test, an audit test, and an endpoint-integration test for each
  # per-workflow write — mirror spec/requests/users_spec.rb from Workflow 1.
end
