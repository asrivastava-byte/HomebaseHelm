require "rails_helper"

RSpec.describe AuditService do
  let(:admin)     { AdminUser.create!(email: "a@b.com", full_name: "A", role: "cs_t2_escalations") }
  let(:principal) { PermissionService::Principal.new(id: admin.id, role: admin.role, stytch_subject: nil) }

  before { CurrentRequest.ip = "127.0.0.1"; CurrentRequest.request_id = "req-abc" }
  after  { CurrentRequest.reset! }

  it "creates one AuditEvent" do
    expect {
      described_class.record(
        actor: principal, workflow: "user_lookup", action: "user.impersonation_started",
        resource_type: "User", resource_id: 123,
        payload_after: { expires_at: "2026-06-09T12:00:00Z" }
      )
    }.to change(AuditEvent, :count).by(1)

    event = AuditEvent.last
    expect(event.admin_user_id).to eq(admin.id)
    expect(event.role).to          eq("cs_t2_escalations")
    expect(event.workflow).to      eq("user_lookup")
    expect(event.action).to        eq("user.impersonation_started")
    expect(event.resource_type).to eq("User")
    expect(event.resource_id).to   eq(123)
    expect(event.payload_after).to eq("expires_at" => "2026-06-09T12:00:00Z")
    expect(event.request_id).to    eq("req-abc")
    expect(event.ip).to            eq("127.0.0.1")
  end

  it "emits a structured log line tagged event=helm.audit" do
    logs = StringIO.new
    allow(Rails).to receive(:logger).and_return(Logger.new(logs))
    described_class.record(
      actor: principal, workflow: "user_lookup", action: "user.viewed",
      resource_type: "User", resource_id: 1
    )
    line = logs.string.lines.find { |l| l.include?("helm.audit") }
    expect(line).to be_present
    parsed = JSON.parse(line[/\{.*\}/])
    expect(parsed["event"]).to        eq("helm.audit")
    expect(parsed["admin_user_id"]).to eq(admin.id)
    expect(parsed["role"]).to          eq("cs_t2_escalations")
    expect(parsed["action"]).to        eq("user.viewed")
    expect(parsed["resource"]).to      eq("User#1")
  end
end
