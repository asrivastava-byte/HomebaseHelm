require "rails_helper"
require "tmpdir"
require "fileutils"
require_relative "../../../scripts/lib/scaffold/naming"
require_relative "../../../scripts/lib/scaffold/permissions_yaml"
require_relative "../../../scripts/lib/scaffold/generator"

RSpec.describe Scaffold::Generator do
  def stage(dir)
    FileUtils.mkdir_p(File.join(dir, "app", "api", "helm_api", "v1"))
    FileUtils.mkdir_p(File.join(dir, "app", "api", "entities"))
    FileUtils.mkdir_p(File.join(dir, "app", "services", "hb1_client"))
    FileUtils.mkdir_p(File.join(dir, "spec", "entities"))
    FileUtils.mkdir_p(File.join(dir, "spec", "requests"))
    FileUtils.mkdir_p(File.join(dir, "spec", "services", "hb1_client"))
    FileUtils.mkdir_p(File.join(dir, "client-helm", "src", "lib"))
    FileUtils.mkdir_p(File.join(dir, "client-helm", "src", "pages"))
    FileUtils.mkdir_p(File.join(dir, "docs", "handoff"))
    FileUtils.mkdir_p(File.join(dir, "config"))
    FileUtils.mkdir_p(File.join(dir, "tmp"))
    File.write(File.join(dir, "config", "permissions.yml"), <<~YAML)
      permissions:
        - { key: account.view_user, scope: human }

      roles:
        cs_t1_agent:
          permissions:
            - account.view_user
    YAML
    File.write(File.join(dir, "app", "api", "helm_api", "v1", "base.rb"), <<~RUBY)
      module HelmApi
        module V1
          class Base < Grape::API
            mount HelmApi::V1::SessionApi
          end
        end
      end
    RUBY
  end

  it "writes all expected files for company_merchant/company" do
    Dir.mktmpdir do |dir|
      stage(dir)
      n = Scaffold::Naming.new(workflow: "company_merchant", resource: "company")
      described_class.new(root: dir, naming: n).run!

      expect(File).to exist(File.join(dir, "app", "api", "entities", "company.rb"))
      expect(File).to exist(File.join(dir, "app", "api", "helm_api", "v1", "companies_api.rb"))
      expect(File).to exist(File.join(dir, "app", "services", "hb1_client", "companies.rb"))
      expect(File).to exist(File.join(dir, "spec", "entities", "company_spec.rb"))
      expect(File).to exist(File.join(dir, "spec", "requests", "company_merchant_spec.rb"))
      expect(File).to exist(File.join(dir, "spec", "services", "hb1_client", "companies_spec.rb"))
      expect(File).to exist(File.join(dir, "client-helm", "src", "lib", "companies.ts"))
      expect(File).to exist(File.join(dir, "client-helm", "src", "pages", "CompanyMerchant", "IndexPage.tsx"))
      expect(File).to exist(File.join(dir, "client-helm", "src", "pages", "CompanyMerchant", "ShowPage.tsx"))
      expect(File).to exist(File.join(dir, "client-helm", "src", "pages", "CompanyMerchant", "IndexPage.test.tsx"))
      expect(File).to exist(File.join(dir, "client-helm", "src", "pages", "CompanyMerchant", "ShowPage.test.tsx"))
      expect(File).to exist(File.join(dir, "docs", "handoff", "company_merchant.md"))
      expect(File).to exist(File.join(dir, "tmp", "hb1-out", "company_merchant", "rpa_api.rb.template"))
      expect(File).to exist(File.join(dir, "tmp", "hb1-out", "company_merchant", "service.rb.template"))
      expect(File).to exist(File.join(dir, "tmp", "hb1-out", "company_merchant", "entity.rb.template"))
      expect(File).to exist(File.join(dir, "tmp", "hb1-out", "company_merchant", "handoff.md.template"))
    end
  end

  it "produces Ruby that has no unrendered ERB tags" do
    Dir.mktmpdir do |dir|
      stage(dir)
      n = Scaffold::Naming.new(workflow: "location_management", resource: "location")
      described_class.new(root: dir, naming: n).run!

      Dir.glob(File.join(dir, "app", "**", "*.rb")).each do |f|
        expect(File.read(f)).not_to include("<%="), "unrendered ERB in #{f}"
      end
      Dir.glob(File.join(dir, "client-helm", "**", "*.tsx")).each do |f|
        expect(File.read(f)).not_to include("<%="), "unrendered ERB in #{f}"
      end
    end
  end

  it "appends only new permission entries to permissions.yml (idempotent)" do
    Dir.mktmpdir do |dir|
      stage(dir)
      n = Scaffold::Naming.new(workflow: "company_merchant", resource: "company")
      2.times { described_class.new(root: dir, naming: n).run! }
      yml = File.read(File.join(dir, "config", "permissions.yml"))
      expect(yml.scan("account.view_company").count).to eq(1)
    end
  end

  it "inserts the mount line into base.rb when scaffolding a new workflow" do
    Dir.mktmpdir do |dir|
      stage(dir)
      n = Scaffold::Naming.new(workflow: "company_merchant", resource: "company")
      described_class.new(root: dir, naming: n).run!
      base_path = File.join(dir, "app", "api", "helm_api", "v1", "base.rb")
      expect(File.read(base_path)).to include("mount HelmApi::V1::#{n.api_class}")
    end
  end

  it "produces UsersApi-equivalent file when scaffolding user_lookup/user (worked-example shape)" do
    Dir.mktmpdir do |dir|
      stage(dir)
      n = Scaffold::Naming.new(workflow: "user_lookup", resource: "user")
      described_class.new(root: dir, naming: n).run!
      api = File.read(File.join(dir, "app", "api", "helm_api", "v1", "users_api.rb"))
      expect(api).to include("class UsersApi < Grape::API")
      expect(api).to include("resource :users")
      expect(api).to include("check_permission!(\"account.view_user\"")
      expect(api).to include("Hb1Client::Users.show")
    end
  end
end
