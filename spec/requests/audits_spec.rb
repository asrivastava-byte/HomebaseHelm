require "rails_helper"

RSpec.describe "GET /helm_api/v1/audits" do
  let!(:admin) { AdminUser.create!(email: "a@b.com", full_name: "A", role: "cs_t2_escalations") }

  before do
    AuditEvent.create!(admin_user_id: admin.id, role: "cs_t2_escalations", workflow: "user_lookup",
                       action: "user.viewed", resource_type: "User", resource_id: 123,
                       request_id: "r1", occurred_at: 1.hour.ago)
    AuditEvent.create!(admin_user_id: admin.id, role: "cs_t2_escalations", workflow: "user_lookup",
                       action: "user.impersonation_started", resource_type: "User", resource_id: 123,
                       request_id: "r2", occurred_at: 30.minutes.ago)
    AuditEvent.create!(admin_user_id: admin.id, role: "cs_t2_escalations", workflow: "user_lookup",
                       action: "user.viewed", resource_type: "User", resource_id: 999,
                       request_id: "r3", occurred_at: Time.current)
  end

  it "returns events for the requested resource, newest first" do
    get "/helm_api/v1/audits",
        params: { resource_type: "User", resource_id: 123 },
        headers: { "Cookie" => "HELM_DEMO_ROLE=cs_t2_escalations" }

    expect(response).to have_http_status(200)
    body = JSON.parse(response.body)
    expect(body.length).to eq(2)
    expect(body.first["action"]).to eq("user.impersonation_started")
    expect(body.last["action"]).to  eq("user.viewed")
  end

  it "returns empty when no events match" do
    get "/helm_api/v1/audits",
        params: { resource_type: "User", resource_id: 444 },
        headers: { "Cookie" => "HELM_DEMO_ROLE=cs_t2_escalations" }
    expect(JSON.parse(response.body)).to eq([])
  end
end
