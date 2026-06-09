require "rails_helper"

RSpec.describe AuditEvent do
  let(:admin) { AdminUser.create!(email: "a@b.com", full_name: "A", role: "cs_t1_agent") }

  it "requires the audit fields" do
    event = described_class.new(admin_user: admin)
    expect(event).not_to be_valid
    expect(event.errors.attribute_names).to include(:role, :workflow, :action, :resource_type, :resource_id, :request_id, :occurred_at)
  end

  it "scopes by resource" do
    e1 = described_class.create!(admin_user: admin, role: "cs_t1_agent", workflow: "user_lookup",
                                 action: "user.viewed", resource_type: "User", resource_id: 1,
                                 request_id: "r1", occurred_at: Time.current)
    described_class.create!(admin_user: admin, role: "cs_t1_agent", workflow: "user_lookup",
                            action: "user.viewed", resource_type: "User", resource_id: 2,
                            request_id: "r2", occurred_at: Time.current)
    expect(described_class.for_resource("User", 1)).to eq([e1])
  end
end
