require "rails_helper"

RSpec.describe PermissionService::YamlBackend do
  subject(:backend) { described_class.new(Rails.root.join("config/permissions.yml")) }

  def principal(role) = PermissionService::Principal.new(id: 1, role: role, stytch_subject: nil)

  matrix = [
    ["cs_t1_agent",       "account.view_user",                :allow],
    ["cs_t1_agent",       "account.view_pii",                 :deny],
    ["cs_t1_agent",       "account.impersonate_user",         :deny],
    ["cs_t2_payroll",     "account.view_pii",                 :allow],
    ["cs_t2_payments",    "billing.update_subscription_tier", :allow],
    ["cs_t2_payments",    "account.impersonate_user",         :deny],
    ["cs_t2_escalations", "account.impersonate_user",         :allow],
    ["cs_t3_ops",         "account.view_pii",                 :deny],
    ["cs_t4_leadership",  "account.impersonate_user",         :deny],
    ["eng_general",       "account.view_pii",                 :allow],
    ["eng_super",         "account.archive_location_jobs",    :allow],
    ["eng_power",         "billing.update_subscription_tier", :allow],
    ["eng_power",         "account.archive_location_jobs",    :allow],
    ["eng_power",         "account.anything_at_all",          :allow],
  ]

  matrix.each do |role, perm, expected|
    it "#{role} -> #{perm} = #{expected}" do
      decision = backend.check(principal(role), perm, {})
      expect(decision.allowed?).to eq(expected == :allow), "got #{decision.allowed?} reason=#{decision.reason}"
    end
  end

  it "raises when YAML has a wildcard outside eng_power" do
    bad = Tempfile.new(["bad", ".yml"]).tap do |f|
      f.write({ "permissions" => [], "roles" => { "cs_t1_agent" => { "permissions" => ["account.*"] } } }.to_yaml)
      f.flush
    end
    expect { described_class.new(bad.path) }
      .to raise_error(described_class::InvalidPermissionsFile, /wildcards are only allowed for eng_power/)
  end

  it "raises when a role references an unknown permission" do
    bad = Tempfile.new(["bad", ".yml"]).tap do |f|
      f.write({
        "permissions" => [{ "key" => "account.view_user", "scope" => "human" }],
        "roles" => { "cs_t1_agent" => { "permissions" => ["account.unknown"] } }
      }.to_yaml)
      f.flush
    end
    expect { described_class.new(bad.path) }
      .to raise_error(described_class::InvalidPermissionsFile, /unknown permission/)
  end

  it "returns the role's permission list" do
    perms = backend.permissions_for(principal("cs_t2_escalations"))
    expect(perms).to include("account.impersonate_user", "account.view_pii")
  end

  it "denies unknown role" do
    decision = backend.check(principal("ghost_role"), "account.view_user", {})
    expect(decision.allowed?).to eq(false)
    expect(decision.reason).to match(/unknown role/)
  end

  it "exposes available_roles in canonical YAML order" do
    expect(backend.available_roles).to eq(%w[
      cs_t1_agent cs_t2_payroll cs_t2_payments cs_t2_escalations
      cs_t3_ops cs_t4_leadership eng_general eng_super eng_power
    ])
  end
end
