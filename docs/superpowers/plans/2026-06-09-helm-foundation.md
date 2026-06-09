# Helm Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the Helm Rails BFF + React frontend skeleton with config-driven permissions (YAML), audit logging, demo identity, and shared UI components. No domain workflow code is built in this plan — Workflow 1 (User Account Lookup) ships in Plan 2.

**Architecture:** Rails 7.2 API-only app with Grape mounted at `/helm_api/v1`. A `PermissionService` reads `config/permissions.yml` (AuthZ-shaped) and answers `(principal, permission_key, scope) → allow|deny`. An `AuditService` writes to a local `audit_events` table and emits Datadog-friendly structured logs. A `DemoIdentity` Rack middleware reads the `HELM_DEMO_ROLE` cookie and sets `env[:helm_principal]`. A separate `client-helm/` Vite + React + TS app boots, calls `GET /helm_api/v1/session` to learn the active role's permissions, and renders shared components (`RoleSwitcher`, `PiiField`, `AuditTrailTab`) that workflow pages will use later.

**Tech Stack:** Rails 7.2.3 (API-only) · Postgres · Grape + Grape-Entity · Faraday (HB1 HTTP client) · `datadog` 2.x + `lograge` (observability) · Rack middleware (cookie parsing, no `ActionDispatch::Cookies` since API-only) · Vite + React 18 + TypeScript · MUI 5 + Emotion · `@tanstack/react-query` · `react-router-dom` 6 · Vitest + `@testing-library/react` · Bun for install/runtime · RSpec + WebMock + FactoryBot.

**Repo layout this plan touches:**

```
~/helm/helm/                       (the Helm Rails app — already a vanilla Rails 7.2 skeleton)
  Gemfile                          ← extend
  config/application.rb            ← register autoload paths + middleware
  config/routes.rb                 ← mount Grape API + serve React index
  config/permissions.yml           ← new (AuthZ-shaped permission matrix)
  config/initializers/
    cors.rb                        ← new
    datadog.rb                     ← new
    lograge.rb                     ← new
  app/api/helm_api/v1/
    base.rb                        ← new (Grape mount point)
    auth_helpers.rb                ← new
    session_api.rb                 ← new
    audits_api.rb                  ← new
  app/middleware/
    demo_identity.rb               ← new
  app/models/
    admin_user.rb                  ← new
    audit_event.rb                 ← new
  app/services/
    permission_service.rb          ← new
    permission_service/yaml_backend.rb     ← new
    permission_service/authz_backend.rb    ← new (stub)
    audit_service.rb               ← new
    hb1_client/base.rb             ← new
    current_request.rb             ← new (thread-local for IP)
  db/migrate/
    *_create_admin_users.rb        ← new
    *_create_audit_events.rb       ← new
  bin/setup, bin/dev, bin/demo-data, Procfile.dev, .env.example   ← new
  client-helm/                     ← new Vite app
    package.json, vite.config.ts, tsconfig.json, index.html
    src/main.tsx, src/App.tsx
    src/lib/{api.ts, permissions.tsx, pii.ts}
    src/components/{RoleSwitcher.tsx, PiiField.tsx, AuditTrailTab.tsx}
  spec/                            (rspec already configured)
    services/permission_service_spec.rb
    services/audit_service_spec.rb
    services/hb1_client/base_spec.rb
    middleware/demo_identity_spec.rb
    requests/session_spec.rb
    requests/audits_spec.rb
```

**Postgres assumption:** Local Postgres is running and reachable. If not, the very first task (`bin/setup`) will fail loudly with the connection error — fix Postgres before proceeding.

---

## Task 1: Add gems and create directory skeleton

**Files:**
- Modify: `Gemfile`
- Create: `app/api/helm_api/v1/.keep`, `app/middleware/.keep`, `app/services/permission_service/.keep`, `app/services/hb1_client/.keep`, `spec/services/.keep`, `spec/middleware/.keep`, `spec/requests/.keep`

- [ ] **Step 1: Open a terminal in the Helm repo**

```bash
cd ~/helm/helm
```

Expected: prompt now shows `helm/helm`.

- [ ] **Step 2: Replace the Gemfile with the foundation gem list**

Open `Gemfile` and replace its full contents with:

```ruby
source "https://rubygems.org"

gem "rails", "~> 7.2.3"
gem "pg", "~> 1.1"
gem "puma", ">= 5.0"

gem "grape"
gem "grape-entity"
gem "faraday"
gem "rack-cors"
gem "lograge"
gem "datadog", "~> 2.0", require: false

gem "tzinfo-data", platforms: %i[windows jruby]
gem "bootsnap", require: false

group :development, :test do
  gem "debug", platforms: %i[mri windows], require: "debug/prelude"
  gem "brakeman", require: false
  gem "rubocop-rails-omakase", require: false
  gem "dotenv-rails"
  gem "rspec-rails", "~> 8.0"
  gem "factory_bot_rails", "~> 6.5"
  gem "rubocop-rails", "~> 2.35"
end

group :test do
  gem "webmock"
end
```

- [ ] **Step 3: Install the gems**

```bash
bundle install
```

Expected: ends with `Bundle complete!`. If `bundler` complains about platform lock, run `bundle lock --add-platform x86_64-linux arm64-darwin` then `bundle install` again.

- [ ] **Step 4: Create directory skeleton**

```bash
mkdir -p app/api/helm_api/v1 app/middleware app/services/permission_service app/services/hb1_client \
         spec/services/permission_service spec/services/hb1_client spec/middleware spec/requests \
         config/initializers db/migrate
touch app/api/helm_api/v1/.keep app/middleware/.keep \
      app/services/permission_service/.keep app/services/hb1_client/.keep \
      spec/services/.keep spec/middleware/.keep spec/requests/.keep
```

Expected: no output. Verify with `ls app/api/helm_api/v1`.

- [ ] **Step 5: Register autoload paths and middleware in `config/application.rb`**

Replace `config/application.rb` with:

```ruby
require_relative "boot"

require "rails/all"

Bundler.require(*Rails.groups)

module Helm
  class Application < Rails::Application
    config.load_defaults 7.2

    config.autoload_lib(ignore: %w[assets tasks])
    config.autoload_paths       += %W[#{config.root}/app/api #{config.root}/app/middleware]
    config.eager_load_paths     += %W[#{config.root}/app/api #{config.root}/app/middleware]

    config.api_only = true

    config.generators do |g|
      g.test_framework :rspec, fixtures: false, view_specs: false, helper_specs: false,
                               routing_specs: false, controller_specs: true, request_specs: true
    end
  end
end
```

- [ ] **Step 6: Confirm Rails still boots**

```bash
bin/rails runner 'puts "boot ok"'
```

Expected: `boot ok`. If you see a gem-load error, re-run `bundle install`.

- [ ] **Step 7: Commit**

```bash
git add Gemfile Gemfile.lock config/application.rb app/api app/middleware app/services spec
git commit -m "feat(helm): add foundation gems and Grape/middleware autoload paths"
```

---

## Task 2: Create `admin_users` and `audit_events` tables

**Files:**
- Create: `db/migrate/<timestamp>_create_admin_users.rb`
- Create: `db/migrate/<timestamp>_create_audit_events.rb`
- Create: `app/models/admin_user.rb`
- Create: `app/models/audit_event.rb`
- Create: `spec/models/admin_user_spec.rb`
- Create: `spec/models/audit_event_spec.rb`

- [ ] **Step 1: Create the database**

```bash
bin/rails db:create
```

Expected: `Created database 'helm_development'` and `Created database 'helm_test'`.

- [ ] **Step 2: Generate the `admin_users` migration**

```bash
bin/rails generate migration CreateAdminUsers email:string:uniq full_name:string role:string stytch_subject:string
```

Then open the generated file in `db/migrate/` and replace its body with:

```ruby
class CreateAdminUsers < ActiveRecord::Migration[7.2]
  def change
    create_table :admin_users do |t|
      t.string :email,          null: false
      t.string :full_name,      null: false
      t.string :role,           null: false
      t.string :stytch_subject
      t.timestamps
    end
    add_index :admin_users, :email, unique: true
    add_index :admin_users, :role
  end
end
```

- [ ] **Step 3: Generate the `audit_events` migration**

```bash
bin/rails generate migration CreateAuditEvents
```

Replace the generated file body with:

```ruby
class CreateAuditEvents < ActiveRecord::Migration[7.2]
  def change
    create_table :audit_events do |t|
      t.bigint   :admin_user_id, null: false
      t.string   :role,          null: false
      t.string   :workflow,      null: false
      t.string   :action,        null: false
      t.string   :resource_type, null: false
      t.bigint   :resource_id,   null: false
      t.jsonb    :payload_before
      t.jsonb    :payload_after
      t.string   :request_id,    null: false
      t.string   :ip
      t.datetime :occurred_at,   null: false
      t.timestamps
    end
    add_index :audit_events, [:resource_type, :resource_id]
    add_index :audit_events, :admin_user_id
    add_index :audit_events, :occurred_at
  end
end
```

- [ ] **Step 4: Run migrations**

```bash
bin/rails db:migrate
```

Expected: both migrations run; `db/schema.rb` is created/updated.

- [ ] **Step 5: Write `AdminUser` model**

Create `app/models/admin_user.rb`:

```ruby
class AdminUser < ApplicationRecord
  has_many :audit_events, dependent: :restrict_with_exception

  validates :email,     presence: true, uniqueness: true
  validates :full_name, presence: true
  validates :role,      presence: true
end
```

- [ ] **Step 6: Write `AuditEvent` model**

Create `app/models/audit_event.rb`:

```ruby
class AuditEvent < ApplicationRecord
  belongs_to :admin_user

  validates :role, :workflow, :action, :resource_type, :resource_id,
            :request_id, :occurred_at, presence: true

  scope :for_resource, ->(type, id) { where(resource_type: type, resource_id: id).order(occurred_at: :desc) }
end
```

- [ ] **Step 7: Write failing model specs**

Create `spec/models/admin_user_spec.rb`:

```ruby
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
```

Create `spec/models/audit_event_spec.rb`:

```ruby
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
```

- [ ] **Step 8: Run the specs**

```bash
bin/rails db:test:prepare
bundle exec rspec spec/models
```

Expected: 4 examples, 0 failures.

- [ ] **Step 9: Commit**

```bash
git add db/migrate db/schema.rb app/models spec/models
git commit -m "feat(helm): admin_users and audit_events schema"
```

---

## Task 3: Write `config/permissions.yml`

**Files:**
- Create: `config/permissions.yml`

- [ ] **Step 1: Create the permission matrix**

Create `config/permissions.yml` with the full AuthZ-shaped definition (matches §3.1 of the design):

```yaml
permissions:
  - { key: account.view_user,                  scope: human }
  - { key: account.view_pii,                   scope: human }
  - { key: account.verify_phone,               scope: human }
  - { key: account.impersonate_user,           scope: human }
  - { key: account.view_company,               scope: company }
  - { key: account.view_merchant_profile,      scope: company }
  - { key: billing.update_subscription_tier,   scope: company }
  - { key: account.view_location,              scope: location }
  - { key: account.archive_location_jobs,      scope: location }

roles:
  cs_t1_agent:
    permissions:
      - account.view_user
      - account.verify_phone
      - account.view_company
      - account.view_merchant_profile
      - account.view_location

  cs_t2_payroll:
    permissions:
      - account.view_user
      - account.view_pii
      - account.verify_phone
      - account.view_company
      - account.view_merchant_profile
      - account.view_location

  cs_t2_payments:
    permissions:
      - account.view_user
      - account.view_pii
      - account.verify_phone
      - account.view_company
      - account.view_merchant_profile
      - billing.update_subscription_tier
      - account.view_location

  cs_t2_escalations:
    permissions:
      - account.view_user
      - account.view_pii
      - account.verify_phone
      - account.impersonate_user
      - account.view_company
      - account.view_merchant_profile
      - account.view_location

  cs_t3_ops:
    permissions:
      - account.view_user
      - account.view_company
      - account.view_merchant_profile
      - account.view_location

  cs_t4_leadership:
    permissions:
      - account.view_user
      - account.view_pii
      - account.view_company
      - account.view_merchant_profile
      - account.view_location

  eng_general:
    permissions:
      - account.view_user
      - account.view_pii
      - account.verify_phone
      - account.view_company
      - account.view_merchant_profile
      - account.view_location

  eng_super:
    permissions:
      - account.view_user
      - account.view_pii
      - account.verify_phone
      - account.impersonate_user
      - account.view_company
      - account.view_merchant_profile
      - billing.update_subscription_tier
      - account.view_location
      - account.archive_location_jobs

  eng_power:
    permissions:
      - "account.*"
      - "billing.*"
```

- [ ] **Step 2: Commit**

```bash
git add config/permissions.yml
git commit -m "feat(helm): AuthZ-shaped permissions.yml with 9 roles"
```

---

## Task 4: `PermissionService` interface + `Principal`/`Decision` structs

**Files:**
- Create: `app/services/permission_service.rb`
- Create: `spec/services/permission_service_spec.rb`

- [ ] **Step 1: Write the failing interface spec**

Create `spec/services/permission_service_spec.rb`:

```ruby
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
```

- [ ] **Step 2: Run the spec — it should fail because the class doesn't exist**

```bash
bundle exec rspec spec/services/permission_service_spec.rb
```

Expected: `NameError: uninitialized constant PermissionService`.

- [ ] **Step 3: Write the minimal interface**

Create `app/services/permission_service.rb`:

```ruby
module PermissionService
  Principal = Struct.new(:id, :role, :stytch_subject, keyword_init: true) do
    def can?(permission_key)
      PermissionService.permissions_for(self).any? do |p|
        p == permission_key || (p.end_with?(".*") && permission_key.start_with?(p[0..-3]))
      end
    end
  end

  Decision  = Struct.new(:allowed?, :reason, keyword_init: true)

  class Forbidden < StandardError; end

  def self.backend
    @backend ||= case ENV.fetch("HELM_PERMISSION_BACKEND", "yaml")
                 when "yaml"  then YamlBackend.new(Rails.root.join("config/permissions.yml"))
                 when "authz" then AuthZBackend.new
                 else raise ArgumentError, "unknown HELM_PERMISSION_BACKEND"
                 end
  end

  def self.reset_backend!
    @backend = nil
  end

  def self.check!(principal, permission_key, scope:)
    decision = backend.check(principal, permission_key, scope)
    raise Forbidden, decision.reason unless decision.allowed?
  end

  def self.permissions_for(principal)
    backend.permissions_for(principal)
  end

  def self.available_roles
    backend.available_roles
  end
end
```

- [ ] **Step 4: Run the spec — should now pass**

```bash
bundle exec rspec spec/services/permission_service_spec.rb
```

Expected: 3 examples, 0 failures.

- [ ] **Step 5: Commit**

```bash
git add app/services/permission_service.rb spec/services/permission_service_spec.rb
git commit -m "feat(helm): PermissionService interface with Principal/Decision/Forbidden"
```

---

## Task 5: `PermissionService::YamlBackend`

**Files:**
- Create: `app/services/permission_service/yaml_backend.rb`
- Create: `app/services/permission_service/authz_backend.rb`
- Create: `spec/services/permission_service/yaml_backend_spec.rb`

- [ ] **Step 1: Write the failing table-driven backend spec**

Create `spec/services/permission_service/yaml_backend_spec.rb`:

```ruby
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
```

- [ ] **Step 2: Run — should fail with NameError**

```bash
bundle exec rspec spec/services/permission_service/yaml_backend_spec.rb
```

Expected: `NameError: uninitialized constant PermissionService::YamlBackend`.

- [ ] **Step 3: Implement the YAML backend**

Create `app/services/permission_service/yaml_backend.rb`:

```ruby
require "yaml"

module PermissionService
  class YamlBackend
    class InvalidPermissionsFile < StandardError; end

    WILDCARD_ALLOWED_ROLE = "eng_power".freeze

    def initialize(path)
      @path = path.to_s
      @data = YAML.load_file(@path)
      @permission_keys = (@data.fetch("permissions") || []).map { |p| p.fetch("key") }.to_set
      @roles = @data.fetch("roles") || {}
      validate!
    end

    def check(principal, permission_key, _scope)
      perms = permissions_for(principal)
      return Decision.new(allowed?: false, reason: "unknown role: #{principal.role}") if perms.nil?

      allowed = perms.any? do |p|
        p == permission_key || (p.end_with?(".*") && permission_key.start_with?(p[0..-3]))
      end
      Decision.new(
        allowed?: allowed,
        reason:   allowed ? nil : "role=#{principal.role} lacks permission=#{permission_key}"
      )
    end

    def permissions_for(principal)
      role = @roles[principal.role]
      return nil if role.nil?
      role.fetch("permissions", [])
    end

    def available_roles
      @roles.keys
    end

    private

    def validate!
      @roles.each do |role_name, role_def|
        Array(role_def["permissions"]).each do |perm|
          if perm.end_with?(".*")
            if role_name != WILDCARD_ALLOWED_ROLE
              raise InvalidPermissionsFile,
                "wildcards are only allowed for #{WILDCARD_ALLOWED_ROLE} (role=#{role_name} perm=#{perm})"
            end
          else
            unless @permission_keys.include?(perm)
              raise InvalidPermissionsFile, "unknown permission '#{perm}' for role '#{role_name}'"
            end
          end
        end
      end
    end
  end
end
```

- [ ] **Step 4: Create the AuthZ backend stub**

Create `app/services/permission_service/authz_backend.rb`:

```ruby
module PermissionService
  class AuthZBackend
    def check(_principal, _permission_key, _scope)
      raise NotImplementedError, "AuthZBackend stub — wire to AuthZ gRPC when admin-rep reconciliation lands"
    end

    def permissions_for(_principal)
      raise NotImplementedError, "AuthZBackend stub"
    end

    def available_roles
      raise NotImplementedError, "AuthZBackend stub"
    end
  end
end
```

- [ ] **Step 5: Run the backend spec**

```bash
bundle exec rspec spec/services/permission_service/yaml_backend_spec.rb
```

Expected: 19 examples, 0 failures (14 matrix rows + 5 structural specs).

- [ ] **Step 6: Run all specs to confirm nothing else broke**

```bash
bundle exec rspec
```

Expected: all green.

- [ ] **Step 7: Commit**

```bash
git add app/services/permission_service spec/services/permission_service
git commit -m "feat(helm): YAML permission backend with wildcard validation"
```

---

## Task 6: `AuditService`

**Files:**
- Create: `app/services/current_request.rb`
- Create: `app/services/audit_service.rb`
- Create: `spec/services/audit_service_spec.rb`

- [ ] **Step 1: Write the failing audit spec**

Create `spec/services/audit_service_spec.rb`:

```ruby
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
```

- [ ] **Step 2: Run — should fail**

```bash
bundle exec rspec spec/services/audit_service_spec.rb
```

Expected: `NameError: uninitialized constant AuditService`.

- [ ] **Step 3: Implement `CurrentRequest` (thread-local request metadata)**

Create `app/services/current_request.rb`:

```ruby
class CurrentRequest
  class << self
    def ip
      Thread.current[:helm_current_request_ip]
    end

    def ip=(value)
      Thread.current[:helm_current_request_ip] = value
    end

    def request_id
      Thread.current[:helm_current_request_id]
    end

    def request_id=(value)
      Thread.current[:helm_current_request_id] = value
    end

    def reset!
      Thread.current[:helm_current_request_ip] = nil
      Thread.current[:helm_current_request_id] = nil
    end
  end
end
```

- [ ] **Step 4: Implement `AuditService`**

Create `app/services/audit_service.rb`:

```ruby
class AuditService
  def self.record(actor:, workflow:, action:, resource_type:, resource_id:,
                  payload_before: nil, payload_after: nil)
    event = AuditEvent.create!(
      admin_user_id:  actor.id,
      role:           actor.role,
      workflow:       workflow,
      action:         action,
      resource_type:  resource_type,
      resource_id:    resource_id,
      payload_before: payload_before,
      payload_after:  payload_after,
      request_id:     CurrentRequest.request_id || SecureRandom.uuid,
      ip:             CurrentRequest.ip,
      occurred_at:    Time.current
    )

    Rails.logger.info({
      event:           "helm.audit",
      audit_event_id:  event.id,
      admin_user_id:   actor.id,
      role:            actor.role,
      workflow:        workflow,
      action:          action,
      resource:        "#{resource_type}##{resource_id}",
      request_id:      event.request_id
    }.to_json)

    event
  end
end
```

- [ ] **Step 5: Run the spec**

```bash
bundle exec rspec spec/services/audit_service_spec.rb
```

Expected: 2 examples, 0 failures.

- [ ] **Step 6: Commit**

```bash
git add app/services/current_request.rb app/services/audit_service.rb spec/services/audit_service_spec.rb
git commit -m "feat(helm): AuditService with structured log emit"
```

---

## Task 7: `Hb1Client::Base` (HTTP transport)

**Files:**
- Create: `app/services/hb1_client/base.rb`
- Create: `spec/services/hb1_client/base_spec.rb`
- Modify: `spec/rails_helper.rb` (require webmock)

- [ ] **Step 1: Enable WebMock in `spec/rails_helper.rb`**

At the top of `spec/rails_helper.rb`, after the existing requires, add:

```ruby
require "webmock/rspec"
WebMock.disable_net_connect!(allow_localhost: true)
```

- [ ] **Step 2: Write the failing client spec**

Create `spec/services/hb1_client/base_spec.rb`:

```ruby
require "rails_helper"

RSpec.describe Hb1Client::Base do
  before do
    ENV["HB1_API_BASE_URL"] = "https://hb1.test"
    ENV["HB1_API_TOKEN"]    = "test-token"
  end

  it "GETs with Bearer token and returns parsed JSON" do
    stub = stub_request(:get, "https://hb1.test/api/rpa_api/v1/users/1")
      .with(headers: { "Authorization" => "Bearer test-token", "Accept" => "application/json" })
      .to_return(status: 200, body: { id: 1, email: "u@h.com" }.to_json,
                 headers: { "Content-Type" => "application/json" })

    body = described_class.get("/api/rpa_api/v1/users/1")
    expect(body).to eq("id" => 1, "email" => "u@h.com")
    expect(stub).to have_been_requested
  end

  it "POSTs JSON body" do
    stub = stub_request(:post, "https://hb1.test/api/rpa_api/v1/users/1/verification_sms")
      .with(headers: { "Authorization" => "Bearer test-token" },
            body: { reason: "demo" }.to_json)
      .to_return(status: 201, body: { sent_at: "now" }.to_json,
                 headers: { "Content-Type" => "application/json" })

    body = described_class.post("/api/rpa_api/v1/users/1/verification_sms", body: { reason: "demo" })
    expect(body).to eq("sent_at" => "now")
    expect(stub).to have_been_requested
  end

  it "raises Hb1Client::Error on non-2xx" do
    stub_request(:get, "https://hb1.test/api/rpa_api/v1/users/999")
      .to_return(status: 404, body: { error: "not found" }.to_json,
                 headers: { "Content-Type" => "application/json" })

    expect { described_class.get("/api/rpa_api/v1/users/999") }
      .to raise_error(Hb1Client::Error, /404/)
  end
end
```

- [ ] **Step 3: Run — should fail**

```bash
bundle exec rspec spec/services/hb1_client/base_spec.rb
```

Expected: `NameError: uninitialized constant Hb1Client`.

- [ ] **Step 4: Implement the client**

Create `app/services/hb1_client/base.rb`:

```ruby
require "faraday"

module Hb1Client
  class Error < StandardError; end

  class Base
    def self.connection
      Faraday.new(url: ENV.fetch("HB1_API_BASE_URL")) do |f|
        f.request  :json
        f.response :json, content_type: /\bjson$/
        f.adapter  Faraday.default_adapter
      end
    end

    def self.get(path, params: {})
      request(:get, path, params: params)
    end

    def self.post(path, body: {})
      request(:post, path, body: body)
    end

    def self.request(method, path, params: {}, body: {})
      response = connection.public_send(method, path) do |req|
        req.headers["Authorization"] = "Bearer #{ENV.fetch('HB1_API_TOKEN')}"
        req.headers["Accept"]        = "application/json"
        req.params  = params if params.any?
        req.body    = body   if body.any?
      end

      unless response.success?
        raise Error, "HB1 #{method.upcase} #{path} returned #{response.status}: #{response.body.inspect}"
      end

      response.body
    end
  end
end
```

- [ ] **Step 5: Run the spec**

```bash
bundle exec rspec spec/services/hb1_client/base_spec.rb
```

Expected: 3 examples, 0 failures.

- [ ] **Step 6: Commit**

```bash
git add app/services/hb1_client spec/services/hb1_client spec/rails_helper.rb
git commit -m "feat(helm): Hb1Client::Base with Bearer auth and JSON Faraday transport"
```

---

## Task 8: `DemoIdentity` Rack middleware

**Files:**
- Create: `app/middleware/demo_identity.rb`
- Create: `spec/middleware/demo_identity_spec.rb`
- Modify: `config/application.rb` (register middleware)

- [ ] **Step 1: Write the failing middleware spec**

Create `spec/middleware/demo_identity_spec.rb`:

```ruby
require "rails_helper"

RSpec.describe DemoIdentity do
  let(:downstream) do
    lambda do |env|
      [200, {}, [env[:helm_principal].role]]
    end
  end

  subject(:middleware) { described_class.new(downstream) }

  it "defaults to cs_t1_agent when no cookie or env override" do
    ENV.delete("HELM_DEMO_ROLE")
    env = Rack::MockRequest.env_for("/")
    _, _, body = middleware.call(env)
    expect(body.first).to eq("cs_t1_agent")
  end

  it "reads the HELM_DEMO_ROLE cookie" do
    env = Rack::MockRequest.env_for("/", "HTTP_COOKIE" => "HELM_DEMO_ROLE=cs_t2_escalations; other=foo")
    _, _, body = middleware.call(env)
    expect(body.first).to eq("cs_t2_escalations")
  end

  it "falls back to ENV when cookie absent" do
    ENV["HELM_DEMO_ROLE"] = "eng_power"
    env = Rack::MockRequest.env_for("/")
    _, _, body = middleware.call(env)
    expect(body.first).to eq("eng_power")
    ENV.delete("HELM_DEMO_ROLE")
  end

  it "sets CurrentRequest.ip and request_id for the request" do
    env = Rack::MockRequest.env_for("/", "REMOTE_ADDR" => "10.0.0.1", "HTTP_X_REQUEST_ID" => "req-xyz")
    middleware.call(env)
    expect(env[:helm_principal]).to be_a(PermissionService::Principal)
  end
end
```

- [ ] **Step 2: Run — should fail**

```bash
bundle exec rspec spec/middleware/demo_identity_spec.rb
```

Expected: `NameError: uninitialized constant DemoIdentity`.

- [ ] **Step 3: Implement the middleware**

Create `app/middleware/demo_identity.rb`:

```ruby
class DemoIdentity
  def initialize(app)
    @app = app
  end

  def call(env)
    role = parse_cookie(env, "HELM_DEMO_ROLE") || ENV["HELM_DEMO_ROLE"] || "cs_t1_agent"
    env[:helm_principal] = PermissionService::Principal.new(
      id: 1, role: role, stytch_subject: nil
    )

    CurrentRequest.ip         = env["REMOTE_ADDR"]
    CurrentRequest.request_id = env["HTTP_X_REQUEST_ID"] || SecureRandom.uuid

    @app.call(env)
  ensure
    CurrentRequest.reset!
  end

  private

  def parse_cookie(env, name)
    header = env["HTTP_COOKIE"]
    return nil if header.blank?

    header.split(/;\s*/).each do |pair|
      k, v = pair.split("=", 2)
      return v if k == name
    end
    nil
  end
end
```

- [ ] **Step 4: Register middleware in `config/application.rb`**

Inside `class Application < Rails::Application`, after `config.api_only = true`, add:

```ruby
    config.middleware.use "DemoIdentity"
```

- [ ] **Step 5: Run the middleware spec**

```bash
bundle exec rspec spec/middleware/demo_identity_spec.rb
```

Expected: 4 examples, 0 failures.

- [ ] **Step 6: Verify Rails still boots with the middleware**

```bash
bin/rails runner 'puts Rails.application.middleware.map(&:name).grep(/DemoIdentity/)'
```

Expected: `DemoIdentity`.

- [ ] **Step 7: Commit**

```bash
git add app/middleware/demo_identity.rb spec/middleware/demo_identity_spec.rb config/application.rb
git commit -m "feat(helm): DemoIdentity middleware reading HELM_DEMO_ROLE cookie"
```

---

## Task 9: Grape mount + `AuthHelpers`

**Files:**
- Create: `app/api/helm_api/v1/base.rb`
- Create: `app/api/helm_api/v1/auth_helpers.rb`
- Modify: `config/routes.rb`
- Create: `spec/requests/auth_helpers_spec.rb`

- [ ] **Step 1: Write the failing helper spec**

Create `spec/requests/auth_helpers_spec.rb`:

```ruby
require "rails_helper"

RSpec.describe "AuthHelpers" do
  it "returns 403 when principal lacks permission" do
    get "/helm_api/v1/_probe/needs_impersonate",
        headers: { "Cookie" => "HELM_DEMO_ROLE=cs_t1_agent" }
    expect(response).to have_http_status(403)
  end

  it "returns 200 when principal has permission" do
    get "/helm_api/v1/_probe/needs_impersonate",
        headers: { "Cookie" => "HELM_DEMO_ROLE=cs_t2_escalations" }
    expect(response).to have_http_status(200)
  end
end
```

This spec hits a probe route we add next, just to verify the helper.

- [ ] **Step 2: Create `AuthHelpers`**

Create `app/api/helm_api/v1/auth_helpers.rb`:

```ruby
module HelmApi
  module V1
    module AuthHelpers
      def current_principal
        env[:helm_principal]
      end

      def check_permission!(permission_key, scope: {})
        PermissionService.check!(current_principal, permission_key, scope: scope)
      rescue PermissionService::Forbidden => e
        error!({ error: "forbidden", reason: e.message }, 403)
      end
    end
  end
end
```

- [ ] **Step 3: Create the Grape mount**

Create `app/api/helm_api/v1/base.rb`:

```ruby
module HelmApi
  module V1
    class Base < Grape::API
      version "v1", using: :path
      format :json
      default_format :json

      helpers AuthHelpers

      rescue_from :all do |e|
        Rails.logger.error("[helm_api] #{e.class}: #{e.message}\n#{e.backtrace.first(10).join("\n")}")
        error!({ error: e.class.name, message: e.message }, 500)
      end

      # Probe route — only exists so AuthHelpers can be tested without a full workflow.
      namespace :_probe do
        get :needs_impersonate do
          check_permission!("account.impersonate_user", scope: {})
          { ok: true }
        end
      end
    end
  end
end
```

- [ ] **Step 4: Mount the Grape API in `config/routes.rb`**

Replace `config/routes.rb` with:

```ruby
Rails.application.routes.draw do
  get "up" => "rails/health#show", as: :rails_health_check

  mount HelmApi::V1::Base => "/helm_api"
end
```

Note: Grape's `version "v1", using: :path` makes routes show up under `/helm_api/v1/...`.

- [ ] **Step 5: Run the spec**

```bash
bundle exec rspec spec/requests/auth_helpers_spec.rb
```

Expected: 2 examples, 0 failures.

- [ ] **Step 6: Sanity-check the route table**

```bash
bin/rails routes -g helm_api
```

Expected: routes that include `/helm_api/v1/_probe/needs_impersonate`.

- [ ] **Step 7: Commit**

```bash
git add app/api config/routes.rb spec/requests/auth_helpers_spec.rb
git commit -m "feat(helm): Grape mount + AuthHelpers (current_principal, check_permission!)"
```

---

## Task 10: `SessionApi` — GET /helm_api/v1/session

**Files:**
- Create: `app/api/helm_api/v1/session_api.rb`
- Create: `spec/requests/session_spec.rb`
- Modify: `app/api/helm_api/v1/base.rb` (mount SessionApi)

- [ ] **Step 1: Write the failing request spec**

Create `spec/requests/session_spec.rb`:

```ruby
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
```

- [ ] **Step 2: Run — should fail (no route)**

```bash
bundle exec rspec spec/requests/session_spec.rb
```

Expected: 404 / route-not-found failures.

- [ ] **Step 3: Implement `SessionApi`**

Create `app/api/helm_api/v1/session_api.rb`:

```ruby
module HelmApi
  module V1
    class SessionApi < Grape::API
      helpers AuthHelpers

      resource :session do
        get do
          {
            role:            current_principal.role,
            permissions:     PermissionService.permissions_for(current_principal),
            available_roles: PermissionService.available_roles
          }
        end
      end
    end
  end
end
```

- [ ] **Step 4: Mount `SessionApi` under `Base`**

In `app/api/helm_api/v1/base.rb`, after the `_probe` namespace and before the closing `end`s, add:

```ruby
      mount HelmApi::V1::SessionApi
```

- [ ] **Step 5: Run the spec**

```bash
bundle exec rspec spec/requests/session_spec.rb
```

Expected: 3 examples, 0 failures.

- [ ] **Step 6: Manual smoke**

```bash
bin/rails server -p 3001 &
sleep 2
curl -s -H "Cookie: HELM_DEMO_ROLE=cs_t2_escalations" http://localhost:3001/helm_api/v1/session | jq
kill %1
```

Expected: JSON with `role: "cs_t2_escalations"` and `account.impersonate_user` in permissions.

- [ ] **Step 7: Commit**

```bash
git add app/api/helm_api/v1/session_api.rb app/api/helm_api/v1/base.rb spec/requests/session_spec.rb
git commit -m "feat(helm): GET /helm_api/v1/session returning role + permissions"
```

---

## Task 11: `AuditsApi` — GET /helm_api/v1/audits

**Files:**
- Create: `app/api/helm_api/v1/audits_api.rb`
- Create: `spec/requests/audits_spec.rb`
- Modify: `app/api/helm_api/v1/base.rb` (mount AuditsApi)

- [ ] **Step 1: Write the failing audits spec**

Create `spec/requests/audits_spec.rb`:

```ruby
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
```

- [ ] **Step 2: Run — should fail (no route)**

```bash
bundle exec rspec spec/requests/audits_spec.rb
```

Expected: failures with route-not-found.

- [ ] **Step 3: Implement `AuditsApi`**

Create `app/api/helm_api/v1/audits_api.rb`:

```ruby
module HelmApi
  module V1
    class AuditsApi < Grape::API
      helpers AuthHelpers

      resource :audits do
        params do
          requires :resource_type, type: String
          requires :resource_id,   type: Integer
        end
        get do
          events = AuditEvent.for_resource(params[:resource_type], params[:resource_id])
          events.map do |e|
            {
              id:             e.id,
              admin_user_id:  e.admin_user_id,
              role:           e.role,
              workflow:       e.workflow,
              action:         e.action,
              resource_type:  e.resource_type,
              resource_id:    e.resource_id,
              payload_before: e.payload_before,
              payload_after:  e.payload_after,
              occurred_at:    e.occurred_at.iso8601
            }
          end
        end
      end
    end
  end
end
```

- [ ] **Step 4: Mount `AuditsApi` under `Base`**

In `app/api/helm_api/v1/base.rb`, alongside the existing `mount HelmApi::V1::SessionApi`, add:

```ruby
      mount HelmApi::V1::AuditsApi
```

- [ ] **Step 5: Run the spec**

```bash
bundle exec rspec spec/requests/audits_spec.rb
```

Expected: 2 examples, 0 failures.

- [ ] **Step 6: Commit**

```bash
git add app/api/helm_api/v1/audits_api.rb app/api/helm_api/v1/base.rb spec/requests/audits_spec.rb
git commit -m "feat(helm): GET /helm_api/v1/audits scoped by resource_type+resource_id"
```

---

## Task 12: CORS, lograge, Datadog initializers

**Files:**
- Create: `config/initializers/cors.rb`
- Create: `config/initializers/lograge.rb`
- Create: `config/initializers/datadog.rb`

- [ ] **Step 1: CORS — allow the Vite dev server**

Create `config/initializers/cors.rb`:

```ruby
Rails.application.config.middleware.insert_before 0, Rack::Cors do
  allow do
    origins ENV.fetch("HELM_CORS_ORIGINS", "http://localhost:5173").split(",")
    resource "/helm_api/*",
             headers:     :any,
             methods:     %i[get post put patch delete options head],
             credentials: true
  end
end
```

- [ ] **Step 2: Lograge — structured JSON with helm tags**

Create `config/initializers/lograge.rb`:

```ruby
Rails.application.configure do
  config.lograge.enabled = true
  config.lograge.formatter = Lograge::Formatters::Json.new
  config.lograge.custom_payload do |controller|
    request = controller.request
    principal = request.env[:helm_principal]
    {
      admin_user_id: principal&.id,
      role:          principal&.role,
      request_id:    request.request_id
    }
  end
end
```

- [ ] **Step 3: Datadog — no-op when DD_API_KEY missing, but instrument when present**

Create `config/initializers/datadog.rb`:

```ruby
if ENV["DD_API_KEY"].present?
  require "datadog/auto_instrument"
  Datadog.configure do |c|
    c.service = "helm"
    c.env     = ENV.fetch("DD_ENV", Rails.env)
    c.tracing.instrument :rails
    c.tracing.instrument :rack
    c.tracing.instrument :faraday
  end
else
  Rails.logger.info("[datadog] DD_API_KEY absent — tracing disabled")
end
```

- [ ] **Step 4: Verify boot still works**

```bash
bin/rails runner 'puts "ok"'
```

Expected: `ok` (plus the datadog disabled log line).

- [ ] **Step 5: Confirm CORS preflight works**

```bash
bin/rails server -p 3001 &
sleep 2
curl -s -i -X OPTIONS http://localhost:3001/helm_api/v1/session \
  -H "Origin: http://localhost:5173" \
  -H "Access-Control-Request-Method: GET" | head -10
kill %1
```

Expected: `HTTP/1.1 200` or `204` with `Access-Control-Allow-Origin: http://localhost:5173`.

- [ ] **Step 6: Commit**

```bash
git add config/initializers
git commit -m "feat(helm): CORS, lograge JSON formatter, optional Datadog tracing"
```

---

## Task 13: `bin/setup`, `bin/dev`, `bin/demo-data`, `Procfile.dev`, `.env.example`

**Files:**
- Create or overwrite: `bin/setup`, `bin/dev`, `bin/demo-data`, `Procfile.dev`, `.env.example`

- [ ] **Step 1: `.env.example`**

Create `.env.example`:

```
# HB1 backend connectivity
HB1_API_BASE_URL=http://localhost:3000
HB1_API_TOKEN=replace-me

# Permission backend (yaml | authz)
HELM_PERMISSION_BACKEND=yaml

# Default demo role (overridden by cookie set via RoleSwitcher)
HELM_DEMO_ROLE=cs_t1_agent

# CORS — comma-separated origins
HELM_CORS_ORIGINS=http://localhost:5173

# Datadog (optional — tracing is no-op when DD_API_KEY is unset)
# DD_API_KEY=
# DD_ENV=development
```

- [ ] **Step 2: `Procfile.dev`**

Create `Procfile.dev`:

```
rails: bin/rails server -p 3001
vite:  cd client-helm && bun run dev
```

- [ ] **Step 3: `bin/setup`**

Create `bin/setup`:

```bash
#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

echo "== Installing Ruby gems =="
bundle install

echo "== Setting up database =="
bin/rails db:prepare

echo "== Seeding demo admin_users =="
bin/demo-data

if [ -d client-helm ]; then
  echo "== Installing frontend deps =="
  (cd client-helm && bun install)
fi

echo "== Done. Run bin/dev to start the stack. =="
```

Make executable:

```bash
chmod +x bin/setup
```

- [ ] **Step 4: `bin/dev`**

Create `bin/dev`:

```bash
#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

if ! command -v foreman >/dev/null; then
  echo "Installing foreman (one-time)..."
  gem install foreman
fi

exec foreman start -f Procfile.dev
```

Make executable:

```bash
chmod +x bin/dev
```

- [ ] **Step 5: `bin/demo-data`**

Create `bin/demo-data`:

```bash
#!/usr/bin/env ruby
require_relative "../config/environment"

roles = %w[cs_t1_agent cs_t2_payroll cs_t2_payments cs_t2_escalations
           cs_t3_ops cs_t4_leadership eng_general eng_super eng_power]

roles.each do |role|
  AdminUser.find_or_create_by!(email: "#{role}@helm.local") do |u|
    u.full_name = role.split("_").map(&:capitalize).join(" ")
    u.role      = role
  end
end

puts "Seeded #{AdminUser.count} admin_users across #{roles.size} roles."
```

Make executable:

```bash
chmod +x bin/demo-data
```

- [ ] **Step 6: Smoke-test the seeder**

```bash
bin/demo-data
```

Expected: `Seeded 9 admin_users across 9 roles.` Running it again should produce the same count (find_or_create_by).

- [ ] **Step 7: Commit**

```bash
git add bin/setup bin/dev bin/demo-data Procfile.dev .env.example
git commit -m "feat(helm): bin/setup, bin/dev, bin/demo-data, Procfile.dev, .env.example"
```

---

## Task 14: React app skeleton (`client-helm/`)

**Files:**
- Create: `client-helm/package.json`, `vite.config.ts`, `tsconfig.json`, `index.html`
- Create: `client-helm/src/main.tsx`, `client-helm/src/App.tsx`
- Create: `client-helm/.gitignore`

- [ ] **Step 1: Verify Bun is installed**

```bash
bun --version
```

Expected: a version (>=1.0). If not installed: `curl -fsSL https://bun.sh/install | bash`.

- [ ] **Step 2: Create the client directory**

```bash
mkdir -p client-helm/src
cd client-helm
```

- [ ] **Step 3: `package.json`**

Create `client-helm/package.json`:

```json
{
  "name": "helm-client",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "@emotion/react": "^11.11.0",
    "@emotion/styled": "^11.11.0",
    "@mui/material": "^5.15.0",
    "@tanstack/react-query": "^5.20.0",
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "react-router-dom": "^6.22.0"
  },
  "devDependencies": {
    "@testing-library/jest-dom": "^6.4.0",
    "@testing-library/react": "^14.2.0",
    "@types/react": "^18.2.0",
    "@types/react-dom": "^18.2.0",
    "@vitejs/plugin-react": "^4.2.0",
    "jsdom": "^24.0.0",
    "typescript": "^5.3.0",
    "vite": "^5.1.0",
    "vitest": "^1.3.0"
  }
}
```

- [ ] **Step 4: `tsconfig.json`**

Create `client-helm/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "useDefineForClassFields": true,
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "types": ["vitest/globals", "@testing-library/jest-dom"]
  },
  "include": ["src"]
}
```

- [ ] **Step 5: `vite.config.ts`**

Create `client-helm/vite.config.ts`:

```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/helm_api": {
        target: "http://localhost:3001",
        changeOrigin: true,
      },
    },
  },
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: "./src/test-setup.ts",
  },
});
```

- [ ] **Step 6: `index.html`**

Create `client-helm/index.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Helm</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 7: `src/test-setup.ts`**

Create `client-helm/src/test-setup.ts`:

```ts
import "@testing-library/jest-dom/vitest";
```

- [ ] **Step 8: `src/main.tsx`**

Create `client-helm/src/main.tsx`:

```tsx
import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { CssBaseline, ThemeProvider, createTheme } from "@mui/material";
import App from "./App";

const queryClient = new QueryClient();
const theme = createTheme();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </QueryClientProvider>
    </ThemeProvider>
  </React.StrictMode>
);
```

- [ ] **Step 9: `src/App.tsx` (minimal placeholder; populated in Task 17)**

Create `client-helm/src/App.tsx`:

```tsx
import { Box, Typography } from "@mui/material";

export default function App() {
  return (
    <Box p={4}>
      <Typography variant="h4">Helm — Foundation</Typography>
      <Typography>Workflow pages ship in Plan 2.</Typography>
    </Box>
  );
}
```

- [ ] **Step 10: `.gitignore`**

Create `client-helm/.gitignore`:

```
node_modules
dist
.env.local
.vite
```

- [ ] **Step 11: Install deps and verify build**

```bash
cd ~/helm/helm/client-helm
bun install
bun run build
```

Expected: `bun install` resolves cleanly; `bun run build` exits 0 and produces `dist/`.

- [ ] **Step 12: Dev-server smoke test**

```bash
bun run dev &
sleep 3
curl -s http://localhost:5173 | head -5
kill %1
```

Expected: HTML response containing `<div id="root">`.

- [ ] **Step 13: Commit**

```bash
cd ~/helm/helm
git add client-helm
git commit -m "feat(helm): client-helm Vite + React + TS skeleton"
```

---

## Task 15: React `lib/api.ts` + `lib/permissions.tsx` (PermissionProvider, usePermission)

**Files:**
- Create: `client-helm/src/lib/api.ts`
- Create: `client-helm/src/lib/permissions.tsx`
- Create: `client-helm/src/lib/permissions.test.tsx`

- [ ] **Step 1: `src/lib/api.ts`**

Create `client-helm/src/lib/api.ts`:

```ts
export type Session = {
  role: string;
  permissions: string[];
  available_roles: string[];
};

const BASE = "";

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    credentials: "include",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${method} ${path} -> ${res.status}: ${text}`);
  }
  return res.json() as Promise<T>;
}

export const api = {
  get:  <T>(path: string)               => request<T>("GET",  path),
  post: <T>(path: string, body?: unknown) => request<T>("POST", path, body),
};

export const fetchSession = () => api.get<Session>("/helm_api/v1/session");
```

- [ ] **Step 2: Write the failing permission spec**

Create `client-helm/src/lib/permissions.test.tsx`:

```tsx
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { PermissionContext, usePermission } from "./permissions";

function Probe({ permKey }: { permKey: string }) {
  const allowed = usePermission(permKey);
  return <span>{allowed ? "yes" : "no"}</span>;
}

describe("usePermission", () => {
  it("returns true for exact match", () => {
    render(
      <PermissionContext.Provider
        value={{ role: "cs_t1_agent", permissions: ["account.view_user"], available_roles: [] }}
      >
        <Probe permKey="account.view_user" />
      </PermissionContext.Provider>
    );
    expect(screen.getByText("yes")).toBeInTheDocument();
  });

  it("returns false when missing", () => {
    render(
      <PermissionContext.Provider
        value={{ role: "cs_t1_agent", permissions: ["account.view_user"], available_roles: [] }}
      >
        <Probe permKey="account.impersonate_user" />
      </PermissionContext.Provider>
    );
    expect(screen.getByText("no")).toBeInTheDocument();
  });

  it("honors wildcard permissions", () => {
    render(
      <PermissionContext.Provider
        value={{ role: "eng_power", permissions: ["account.*"], available_roles: [] }}
      >
        <Probe permKey="account.impersonate_user" />
      </PermissionContext.Provider>
    );
    expect(screen.getByText("yes")).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Run — should fail**

```bash
cd client-helm
bun run test
```

Expected: failure — module not found.

- [ ] **Step 4: Implement `src/lib/permissions.tsx`**

Create `client-helm/src/lib/permissions.tsx`:

```tsx
import { createContext, useContext, ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchSession, Session } from "./api";

const empty: Session = { role: "", permissions: [], available_roles: [] };

export const PermissionContext = createContext<Session>(empty);

export function PermissionProvider({ children }: { children: ReactNode }) {
  const { data, isLoading } = useQuery({ queryKey: ["session"], queryFn: fetchSession });
  if (isLoading || !data) return null;
  return <PermissionContext.Provider value={data}>{children}</PermissionContext.Provider>;
}

export function useSession() {
  return useContext(PermissionContext);
}

export function usePermission(key: string): boolean {
  const { permissions } = useContext(PermissionContext);
  return permissions.some((p) => p === key || (p.endsWith(".*") && key.startsWith(p.slice(0, -1))));
}
```

- [ ] **Step 5: Run — should pass**

```bash
bun run test
```

Expected: 3 tests pass.

- [ ] **Step 6: Commit**

```bash
cd ~/helm/helm
git add client-helm/src/lib
git commit -m "feat(helm-client): api helper + PermissionContext/usePermission hook"
```

---

## Task 16: `lib/pii.ts` + `PiiField` component

**Files:**
- Create: `client-helm/src/lib/pii.ts`
- Create: `client-helm/src/components/PiiField.tsx`
- Create: `client-helm/src/components/PiiField.test.tsx`

- [ ] **Step 1: `src/lib/pii.ts`**

Create `client-helm/src/lib/pii.ts`:

```ts
export function maskWithSuffix(value: string | null | undefined, suffixLen = 4): string {
  if (!value) return "••••";
  const suffix = value.slice(-suffixLen);
  return `•••••• ${suffix}`;
}
```

- [ ] **Step 2: Write the failing PiiField spec**

Create `client-helm/src/components/PiiField.test.tsx`:

```tsx
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { PiiField } from "./PiiField";

describe("PiiField", () => {
  it("renders the value when not redacted", () => {
    render(<PiiField name="phone" value="555-1234" redactedFields={[]} />);
    expect(screen.getByText("555-1234")).toBeInTheDocument();
  });

  it("renders masked placeholder when redacted", () => {
    render(<PiiField name="phone" value={null} redactedFields={["phone"]} />);
    expect(screen.getByText(/••••/)).toBeInTheDocument();
  });

  it("renders masked with suffix if a suffix is provided", () => {
    render(<PiiField name="ssn_last4" value={null} suffix="6789" redactedFields={["ssn_last4"]} />);
    expect(screen.getByText("•••••• 6789")).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Run — should fail**

```bash
cd client-helm
bun run test src/components/PiiField.test.tsx
```

Expected: failure — module not found.

- [ ] **Step 4: Implement `PiiField`**

Create `client-helm/src/components/PiiField.tsx`:

```tsx
import { Typography } from "@mui/material";
import { maskWithSuffix } from "../lib/pii";

type Props = {
  name: string;
  value: string | null | undefined;
  redactedFields: string[];
  suffix?: string;
};

export function PiiField({ name, value, redactedFields, suffix }: Props) {
  const redacted = redactedFields.includes(name);
  if (redacted) {
    return <Typography component="span">{maskWithSuffix(suffix ?? "", 4)}</Typography>;
  }
  return <Typography component="span">{value ?? ""}</Typography>;
}
```

- [ ] **Step 5: Run — should pass**

```bash
bun run test src/components/PiiField.test.tsx
```

Expected: 3 tests pass.

- [ ] **Step 6: Commit**

```bash
cd ~/helm/helm
git add client-helm/src/lib/pii.ts client-helm/src/components/PiiField.tsx client-helm/src/components/PiiField.test.tsx
git commit -m "feat(helm-client): PiiField + maskWithSuffix helper"
```

---

## Task 17: `RoleSwitcher` component + wire into `App.tsx`

**Files:**
- Create: `client-helm/src/components/RoleSwitcher.tsx`
- Create: `client-helm/src/components/RoleSwitcher.test.tsx`
- Modify: `client-helm/src/App.tsx` (wrap in `PermissionProvider`, render `RoleSwitcher`)

- [ ] **Step 1: Write the failing RoleSwitcher spec**

Create `client-helm/src/components/RoleSwitcher.test.tsx`:

```tsx
import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { PermissionContext } from "../lib/permissions";
import { RoleSwitcher } from "./RoleSwitcher";

const session = {
  role: "cs_t1_agent",
  permissions: ["account.view_user"],
  available_roles: ["cs_t1_agent", "cs_t2_escalations", "eng_super"],
};

describe("RoleSwitcher", () => {
  it("renders the current role and the available roles", () => {
    render(
      <PermissionContext.Provider value={session}>
        <RoleSwitcher />
      </PermissionContext.Provider>
    );
    fireEvent.mouseDown(screen.getByRole("combobox"));
    expect(screen.getByRole("option", { name: "cs_t2_escalations" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "eng_super" })).toBeInTheDocument();
  });

  it("writes the HELM_DEMO_ROLE cookie and reloads on selection", () => {
    const reload = vi.fn();
    Object.defineProperty(window, "location", { value: { reload }, writable: true });

    render(
      <PermissionContext.Provider value={session}>
        <RoleSwitcher />
      </PermissionContext.Provider>
    );
    fireEvent.mouseDown(screen.getByRole("combobox"));
    fireEvent.click(screen.getByRole("option", { name: "eng_super" }));

    expect(document.cookie).toContain("HELM_DEMO_ROLE=eng_super");
    expect(reload).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run — should fail**

```bash
bun run test src/components/RoleSwitcher.test.tsx
```

Expected: failure.

- [ ] **Step 3: Implement `RoleSwitcher`**

Create `client-helm/src/components/RoleSwitcher.tsx`:

```tsx
import { FormControl, InputLabel, MenuItem, Select } from "@mui/material";
import { useSession } from "../lib/permissions";

export function RoleSwitcher() {
  const { role, available_roles } = useSession();

  const onChange = (next: string) => {
    document.cookie = `HELM_DEMO_ROLE=${next}; path=/; max-age=86400`;
    window.location.reload();
  };

  return (
    <FormControl size="small" sx={{ minWidth: 220 }}>
      <InputLabel>Role</InputLabel>
      <Select
        value={role}
        label="Role"
        onChange={(e) => onChange(e.target.value as string)}
      >
        {available_roles.map((r) => (
          <MenuItem key={r} value={r}>{r}</MenuItem>
        ))}
      </Select>
    </FormControl>
  );
}
```

- [ ] **Step 4: Update `App.tsx` to wrap in `PermissionProvider`**

Replace `client-helm/src/App.tsx` with:

```tsx
import { Box, Stack, Typography } from "@mui/material";
import { PermissionProvider, useSession } from "./lib/permissions";
import { RoleSwitcher } from "./components/RoleSwitcher";

function Header() {
  const { role } = useSession();
  return (
    <Stack direction="row" justifyContent="space-between" alignItems="center" p={2}>
      <Typography variant="h5">Helm</Typography>
      <Stack direction="row" spacing={2} alignItems="center">
        <Typography color="text.secondary">role: {role}</Typography>
        <RoleSwitcher />
      </Stack>
    </Stack>
  );
}

export default function App() {
  return (
    <PermissionProvider>
      <Box>
        <Header />
        <Box p={4}>
          <Typography>Workflow pages ship in Plan 2.</Typography>
        </Box>
      </Box>
    </PermissionProvider>
  );
}
```

- [ ] **Step 5: Run the RoleSwitcher spec**

```bash
bun run test src/components/RoleSwitcher.test.tsx
```

Expected: 2 tests pass.

- [ ] **Step 6: Commit**

```bash
cd ~/helm/helm
git add client-helm/src/components/RoleSwitcher.tsx client-helm/src/components/RoleSwitcher.test.tsx client-helm/src/App.tsx
git commit -m "feat(helm-client): RoleSwitcher dropdown + PermissionProvider wired into App"
```

---

## Task 18: `AuditTrailTab` component

**Files:**
- Create: `client-helm/src/components/AuditTrailTab.tsx`
- Create: `client-helm/src/components/AuditTrailTab.test.tsx`

- [ ] **Step 1: Write the failing AuditTrailTab spec**

Create `client-helm/src/components/AuditTrailTab.test.tsx`:

```tsx
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuditTrailTab } from "./AuditTrailTab";

function wrap(ui: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{ui}</QueryClientProvider>;
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});

describe("AuditTrailTab", () => {
  it("renders fetched events newest first", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => [
        { id: 2, action: "user.impersonation_started", role: "cs_t2_escalations",
          occurred_at: "2026-06-09T12:00:00Z", payload_after: { expires_at: "later" } },
        { id: 1, action: "user.viewed", role: "cs_t1_agent",
          occurred_at: "2026-06-09T11:00:00Z", payload_after: null },
      ],
    } as Response);

    render(wrap(<AuditTrailTab resourceType="User" resourceId={123} />));

    await waitFor(() => {
      expect(screen.getByText(/user.impersonation_started/)).toBeInTheDocument();
      expect(screen.getByText(/user.viewed/)).toBeInTheDocument();
    });
  });

  it("renders an empty-state when no events", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true, json: async () => []
    } as Response);

    render(wrap(<AuditTrailTab resourceType="User" resourceId={999} />));
    await waitFor(() => {
      expect(screen.getByText(/no audit events/i)).toBeInTheDocument();
    });
  });
});
```

- [ ] **Step 2: Run — should fail**

```bash
bun run test src/components/AuditTrailTab.test.tsx
```

Expected: failure.

- [ ] **Step 3: Implement `AuditTrailTab`**

Create `client-helm/src/components/AuditTrailTab.tsx`:

```tsx
import { useQuery } from "@tanstack/react-query";
import { List, ListItem, ListItemText, Typography, CircularProgress } from "@mui/material";
import { api } from "../lib/api";

type AuditEvent = {
  id: number;
  action: string;
  role: string;
  occurred_at: string;
  payload_before: Record<string, unknown> | null;
  payload_after:  Record<string, unknown> | null;
};

type Props = { resourceType: string; resourceId: number };

export function AuditTrailTab({ resourceType, resourceId }: Props) {
  const { data, isLoading } = useQuery({
    queryKey: ["audits", resourceType, resourceId],
    queryFn: () =>
      api.get<AuditEvent[]>(
        `/helm_api/v1/audits?resource_type=${encodeURIComponent(resourceType)}&resource_id=${resourceId}`
      ),
  });

  if (isLoading) return <CircularProgress />;
  if (!data || data.length === 0) return <Typography>No audit events yet.</Typography>;

  return (
    <List dense>
      {data.map((e) => (
        <ListItem key={e.id} alignItems="flex-start">
          <ListItemText
            primary={`${e.action} — ${e.role}`}
            secondary={`${new Date(e.occurred_at).toLocaleString()} · ${JSON.stringify(e.payload_after ?? {})}`}
          />
        </ListItem>
      ))}
    </List>
  );
}
```

- [ ] **Step 4: Run — should pass**

```bash
bun run test src/components/AuditTrailTab.test.tsx
```

Expected: 2 tests pass.

- [ ] **Step 5: Run the full frontend test suite**

```bash
bun run test
```

Expected: all React tests pass.

- [ ] **Step 6: Commit**

```bash
cd ~/helm/helm
git add client-helm/src/components/AuditTrailTab.tsx client-helm/src/components/AuditTrailTab.test.tsx
git commit -m "feat(helm-client): AuditTrailTab reading /helm_api/v1/audits"
```

---

## Task 19: End-to-end foundation smoke + README update

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Run the full backend test suite**

```bash
cd ~/helm/helm
bundle exec rspec
```

Expected: all green.

- [ ] **Step 2: Run the full frontend test suite**

```bash
cd ~/helm/helm/client-helm
bun run test
```

Expected: all green.

- [ ] **Step 3: Start the full stack via Procfile**

```bash
cd ~/helm/helm
bin/dev
```

Wait until both `rails` and `vite` log they are listening. Leave running.

- [ ] **Step 4: In another terminal, hit `/helm_api/v1/session` for two roles**

```bash
curl -s -H "Cookie: HELM_DEMO_ROLE=cs_t1_agent" http://localhost:3001/helm_api/v1/session | jq '.role, (.permissions | length)'
curl -s -H "Cookie: HELM_DEMO_ROLE=cs_t2_escalations" http://localhost:3001/helm_api/v1/session | jq '.role, (.permissions | length)'
```

Expected:
- `cs_t1_agent` returns 5 permissions
- `cs_t2_escalations` returns 7 permissions (including `account.impersonate_user`)

- [ ] **Step 5: Hit the React app**

Open `http://localhost:5173` in a browser. You should see:
- "Helm" header
- "role: cs_t1_agent"
- A `RoleSwitcher` dropdown listing all 9 roles
- Changing the dropdown sets a cookie and reloads; header updates

- [ ] **Step 6: Verify CORS by hitting the BFF from the Vite dev server**

In the browser console at `http://localhost:5173`:

```js
await fetch("/helm_api/v1/session", { credentials: "include" }).then(r => r.json())
```

Expected: returns the session JSON (proxy handles routing; no CORS error).

- [ ] **Step 7: Stop the stack and replace the README**

Kill `bin/dev` (Ctrl-C). Replace `README.md` with:

```markdown
# Helm

Admin-panel replacement BFF + React UI. Reads from HB1 via REST, applies role-based permissions from
a single YAML file, and audits every write.

## Quick start

```bash
bin/setup        # bundle, db:prepare, seed 9 demo admin_users, bun install
bin/dev          # rails on :3001, vite on :5173 (via foreman + Procfile.dev)
```

Open <http://localhost:5173>.

## Demo role switching

The top-right dropdown writes a `HELM_DEMO_ROLE` cookie. The Rails `DemoIdentity` middleware reads
it on every request and sets `request.env[:helm_principal]`. Production swaps this for Stytch JWT —
the contract (`env[:helm_principal]`) is unchanged.

## Editing permissions

Edit `config/permissions.yml`. Restart Rails. The UI re-reads role permissions on next page load.

## Tests

```bash
bundle exec rspec               # backend
(cd client-helm && bun run test) # frontend
```

## Plans

See `docs/superpowers/plans/` for the implementation plans.
```

- [ ] **Step 8: Final commit**

```bash
git add README.md
git commit -m "docs(helm): foundation README with quick-start, role switching, permission edits"
```

- [ ] **Step 9: Tag the foundation milestone**

```bash
git tag helm-foundation-v1
```

---

## Done with Plan 1

At this point:

- A Rails 7.2 API-only app is running with Grape mounted at `/helm_api/v1`
- `PermissionService` reads `config/permissions.yml` with 9 roles, wildcard-restricted to `eng_power`
- `AuditService` writes to `audit_events` and emits structured logs
- `Hb1Client::Base` is ready for workflow services to call HB1 (no workflow uses it yet)
- `DemoIdentity` middleware reads `HELM_DEMO_ROLE` cookie → `env[:helm_principal]`
- `/helm_api/v1/session` returns role + permissions; `/helm_api/v1/audits` returns events per resource
- A Vite + React + TS + MUI app on :5173 renders the `RoleSwitcher` and is ready to host workflow pages
- Shared React components `PiiField`, `AuditTrailTab` exist and have unit tests
- 0 workflow code, 0 HB1 changes — both arrive in Plan 2

**Next:** Plan 2 builds Workflow 1 (User Account Lookup) end-to-end against this foundation — including the HB1 service extractions for verification SMS and impersonation. After Plan 2, Plan 3 turns the patterns into a scaffold generator and handoff template so Plans 4–5 can build the remaining workflows in a uniform, AI-led way.
