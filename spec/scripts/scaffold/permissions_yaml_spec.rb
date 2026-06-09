require "rails_helper"
require "tmpdir"
require_relative "../../../scripts/lib/scaffold/permissions_yaml"

RSpec.describe Scaffold::PermissionsYaml do
  let(:base_yaml) do
    <<~YAML
      permissions:
        - { key: account.view_user, scope: human }
        - { key: account.view_pii,  scope: human }

      roles:
        cs_t1_agent:
          permissions:
            - account.view_user
    YAML
  end

  it "appends new permission keys before the roles: block" do
    Dir.mktmpdir do |dir|
      path = File.join(dir, "permissions.yml")
      File.write(path, base_yaml)

      described_class.new(path).append!(
        new_permissions: [
          { key: "account.view_company",            scope: "company" },
          { key: "account.view_merchant_profile",   scope: "company" }
        ]
      )

      out = File.read(path)
      expect(out).to include("account.view_company")
      expect(out).to include("account.view_merchant_profile")
      expect(out.index("account.view_company")).to be < out.index("roles:")
    end
  end

  it "is idempotent — re-running does not duplicate entries" do
    Dir.mktmpdir do |dir|
      path = File.join(dir, "permissions.yml")
      File.write(path, base_yaml)
      perms = [{ key: "account.view_company", scope: "company" }]

      2.times { described_class.new(path).append!(new_permissions: perms) }

      out = File.read(path)
      expect(out.scan("account.view_company").count).to eq(1)
    end
  end
end
