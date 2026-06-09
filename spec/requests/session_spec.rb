require "rails_helper"

RSpec.describe "GET /helm_api/v1/session" do
  it "returns role + permissions for cs_t1_agent" do
    get "/helm_api/v1/session", headers: { "Cookie" => "HELM_DEMO_ROLE=cs_t1_agent" }
    expect(response).to have_http_status(200)
    body = JSON.parse(response.body)
    expect(body["role"]).to eq("cs_t1_agent")
    expect(body["permissions"]).to include("account.view_user", "account.verify_phone")
    expect(body["permissions"]).not_to include("account.view_pii", "account.impersonate_user")
  end

  it "returns role + permissions for eng_power (wildcard)" do
    get "/helm_api/v1/session", headers: { "Cookie" => "HELM_DEMO_ROLE=eng_power" }
    body = JSON.parse(response.body)
    expect(body["permissions"]).to include("account.*", "billing.*")
  end

  it "returns the canonical role list under available_roles" do
    get "/helm_api/v1/session", headers: { "Cookie" => "HELM_DEMO_ROLE=cs_t1_agent" }
    body = JSON.parse(response.body)
    expect(body["available_roles"]).to include(
      "cs_t1_agent", "cs_t2_payroll", "cs_t2_payments", "cs_t2_escalations",
      "cs_t3_ops", "cs_t4_leadership", "eng_general", "eng_super", "eng_power"
    )
  end
end
