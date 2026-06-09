require "rails_helper"

RSpec.describe AdminUser do
  it "requires email, full_name, role" do
    user = described_class.new
    expect(user).not_to be_valid
    expect(user.errors.attribute_names).to include(:email, :full_name, :role)
  end

  it "enforces email uniqueness" do
    described_class.create!(email: "a@b.com", full_name: "A", role: "cs_t1_agent")
    dupe = described_class.new(email: "a@b.com", full_name: "A2", role: "cs_t1_agent")
    expect(dupe).not_to be_valid
  end
end
