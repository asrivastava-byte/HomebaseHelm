require "rails_helper"

RSpec.describe PermissionService do
  let(:principal) { described_class::Principal.new(id: 1, role: "cs_t1_agent", stytch_subject: nil) }

  describe ".check!" do
    it "raises Forbidden when backend denies" do
      backend = instance_double("Backend",
        check: described_class::Decision.new(allowed?: false, reason: "nope"))
      allow(described_class).to receive(:backend).and_return(backend)

      expect { described_class.check!(principal, "account.impersonate_user", scope: {}) }
        .to raise_error(described_class::Forbidden, "nope")
    end

    it "returns nil when backend allows" do
      backend = instance_double("Backend",
        check: described_class::Decision.new(allowed?: true, reason: nil))
      allow(described_class).to receive(:backend).and_return(backend)

      expect(described_class.check!(principal, "account.view_user", scope: {})).to be_nil
    end
  end

  describe ".permissions_for" do
    it "delegates to backend" do
      backend = instance_double("Backend", permissions_for: ["account.view_user"])
      allow(described_class).to receive(:backend).and_return(backend)
      expect(described_class.permissions_for(principal)).to eq(["account.view_user"])
    end
  end

  describe ".available_roles" do
    it "delegates to backend" do
      backend = instance_double("Backend", available_roles: ["cs_t1_agent", "eng_power"])
      allow(described_class).to receive(:backend).and_return(backend)
      expect(described_class.available_roles).to eq(["cs_t1_agent", "eng_power"])
    end
  end
end
