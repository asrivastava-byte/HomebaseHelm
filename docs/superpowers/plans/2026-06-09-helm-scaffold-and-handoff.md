# Helm Scaffold + Handoff Toolkit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a `scripts/scaffold-workflow.rb` Ruby script that stamps out a new Helm workflow (entity, Hb1Client, BFF API, React pages, RSpec + Vitest tests, permissions.yml entries), plus `docs/handoff/TEMPLATE.md` and a worked-example `docs/handoff/user_lookup.md`. After this plan, a pack team can build a new admin workflow by running one command and filling in the resource-specific bits — no copy-paste from Plan 2 required.

**Architecture:** Pure Ruby script using ERB for templating. Templates live at `scripts/templates/` (Helm-side) and `scripts/templates/hb1/` (HB1-side `.template` files). The script takes a workflow name + resource singular (e.g. `company_merchant company`), derives all other names by convention (plural, CamelCase, page dir, route resource), and writes files into the helm repo (`app/`, `client-helm/src/`, `spec/`, `docs/`). For `config/permissions.yml`, the script appends an idempotent block — re-running the generator doesn't duplicate entries. For HB1 templates, the script copies `.template` files unchanged into a `tmp/hb1-out/<workflow>/` directory; the HB1 engineer manually picks them up.

**Tech Stack:** Ruby 3.x + ERB + thor-less plain `OptionParser`. No new gems. Tests use the existing RSpec setup (helm side) — the scaffold spec runs the generator into a `tmpdir`, asserts the written files exist with the expected lines, then exercises Rails autoload to confirm the generated Ruby is loadable.

**Plan 2 dependencies (must be complete):**
- `helm-workflow1-v1-helm-only` tag exists; the User Lookup workflow code under `app/api/helm_api/v1/users_api.rb`, `app/api/entities/user.rb`, `app/services/hb1_client/users.rb`, and `client-helm/src/pages/UserLookup/` is the source-of-truth pattern the templates mirror.
- `docs/handoff/hb1-workflow1-user-lookup.md` exists — Plan 3's worked-example doc cross-links to it.

**Repo layout this plan touches:**

```
~/helm/helm/
  scripts/                                                   ← new dir
    scaffold-workflow.rb                                     ← new (the CLI)
    lib/scaffold/
      naming.rb                                              ← new (name derivation)
      generator.rb                                           ← new (ERB orchestration)
      permissions_yaml.rb                                    ← new (idempotent appender)
    templates/
      helm/
        entity.rb.erb
        hb1_client.rb.erb
        api.rb.erb
        request_spec.rb.erb
        entity_spec.rb.erb
        hb1_client_spec.rb.erb
        lib_typed_api.ts.erb
        index_page.tsx.erb
        show_page.tsx.erb
        index_page_test.tsx.erb
        show_page_test.tsx.erb
        handoff.md.erb
      hb1/
        rpa_api.rb.template
        service.rb.template
        entity.rb.template
        handoff.md.template

  spec/scripts/scaffold_spec.rb                              ← new

  docs/handoff/
    TEMPLATE.md                                              ← new (per-team checklist)
    user_lookup.md                                           ← new (worked example)
    hb1-workflow1-user-lookup.md                             ← already exists from Plan 2

  README.md                                                  ← extend (scaffold usage)
```

---

## Task 1: Naming module (one source of truth for all derived names)

**Files:**
- Create: `scripts/lib/scaffold/naming.rb`
- Create: `spec/scripts/scaffold/naming_spec.rb`

- [ ] **Step 1: Create the scaffold lib dirs**

```bash
cd ~/helm/helm
mkdir -p scripts/lib/scaffold scripts/templates/helm scripts/templates/hb1 spec/scripts/scaffold
```

- [ ] **Step 2: Write the failing naming spec**

Create `spec/scripts/scaffold/naming_spec.rb`:

```ruby
require "rails_helper"
require_relative "../../../scripts/lib/scaffold/naming"

RSpec.describe Scaffold::Naming do
  it "derives names for company_merchant/company" do
    n = described_class.new(workflow: "company_merchant", resource: "company")
    expect(n.workflow_snake).to        eq("company_merchant")
    expect(n.workflow_camel).to        eq("CompanyMerchant")
    expect(n.resource_singular).to     eq("company")
    expect(n.resource_plural).to       eq("companies")
    expect(n.resource_class).to        eq("Company")
    expect(n.resource_plural_camel).to eq("Companies")
    expect(n.page_dir).to              eq("CompanyMerchant")
    expect(n.api_class).to             eq("CompaniesApi")
    expect(n.audit_workflow).to        eq("company_merchant")
    expect(n.permission_view_key).to   eq("account.view_company")
    expect(n.permission_module).to     eq("account")
  end

  it "derives names for location_management/location" do
    n = described_class.new(workflow: "location_management", resource: "location")
    expect(n.resource_plural).to       eq("locations")
    expect(n.resource_plural_camel).to eq("Locations")
    expect(n.page_dir).to              eq("LocationManagement")
    expect(n.api_class).to             eq("LocationsApi")
    expect(n.permission_view_key).to   eq("account.view_location")
  end

  it "raises on bad workflow names" do
    expect { described_class.new(workflow: "BadName", resource: "foo") }
      .to raise_error(ArgumentError, /snake_case/)
  end

  it "raises on bad resource names" do
    expect { described_class.new(workflow: "x_y", resource: "Cap") }
      .to raise_error(ArgumentError, /snake_case/)
  end
end
```

- [ ] **Step 3: Run — should fail**

```bash
bundle exec rspec spec/scripts/scaffold/naming_spec.rb
```

Expected: `cannot load such file -- .../scripts/lib/scaffold/naming`.

- [ ] **Step 4: Implement Naming**

Create `scripts/lib/scaffold/naming.rb`:

```ruby
module Scaffold
  class Naming
    SNAKE = /\A[a-z][a-z0-9_]*\z/

    attr_reader :workflow_snake, :resource_singular

    def initialize(workflow:, resource:)
      raise ArgumentError, "workflow must be snake_case, got #{workflow.inspect}" unless workflow =~ SNAKE
      raise ArgumentError, "resource must be snake_case, got #{resource.inspect}" unless resource =~ SNAKE
      @workflow_snake    = workflow
      @resource_singular = resource
    end

    def workflow_camel       = camelize(@workflow_snake)
    def resource_plural      = pluralize(@resource_singular)
    def resource_class       = camelize(@resource_singular)
    def resource_plural_camel = camelize(resource_plural)
    def page_dir             = workflow_camel
    def api_class            = "#{resource_plural_camel}Api"
    def audit_workflow       = @workflow_snake
    def permission_module    = "account"
    def permission_view_key  = "#{permission_module}.view_#{@resource_singular}"

    private

    def camelize(snake) = snake.split("_").map(&:capitalize).join
    def pluralize(word)
      case word
      when /y\z/ then word.sub(/y\z/, "ies")
      when /s\z/, /x\z/, /ch\z/, /sh\z/ then "#{word}es"
      else "#{word}s"
      end
    end
  end
end
```

- [ ] **Step 5: Run — should pass**

```bash
bundle exec rspec spec/scripts/scaffold/naming_spec.rb
```

Expected: 4 examples, 0 failures.

- [ ] **Step 6: Commit**

```bash
git add scripts/lib/scaffold/naming.rb spec/scripts/scaffold/naming_spec.rb
git commit -m "feat(scaffold): Naming module deriving all workflow names from snake_case input"
```

---

## Task 2: Idempotent permissions.yml appender

**Files:**
- Create: `scripts/lib/scaffold/permissions_yaml.rb`
- Create: `spec/scripts/scaffold/permissions_yaml_spec.rb`

- [ ] **Step 1: Write the failing spec**

Create `spec/scripts/scaffold/permissions_yaml_spec.rb`:

```ruby
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
      expect(out).to include("- { key: account.view_company,          scope: company }")
      expect(out).to include("- { key: account.view_merchant_profile, scope: company }")
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
```

- [ ] **Step 2: Run — should fail**

```bash
bundle exec rspec spec/scripts/scaffold/permissions_yaml_spec.rb
```

Expected: `cannot load such file`.

- [ ] **Step 3: Implement the appender**

Create `scripts/lib/scaffold/permissions_yaml.rb`:

```ruby
module Scaffold
  class PermissionsYaml
    def initialize(path)
      @path = path
      @text = File.read(path)
    end

    def append!(new_permissions:)
      lines_to_add = new_permissions.reject { |p| @text.include?(p[:key]) }
      return if lines_to_add.empty?

      formatted = lines_to_add.map { |p| "  - { key: #{p[:key]}, scope: #{p[:scope]} }" }
      roles_index = @text.index(/^roles:/)
      raise "no `roles:` block in #{@path}" unless roles_index

      head = @text[0...roles_index].rstrip
      tail = @text[roles_index..]

      File.write(@path, "#{head}\n#{formatted.join("\n")}\n\n#{tail}")
    end
  end
end
```

- [ ] **Step 4: Run — should pass**

```bash
bundle exec rspec spec/scripts/scaffold/permissions_yaml_spec.rb
```

Expected: 2 examples, 0 failures.

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/scaffold/permissions_yaml.rb spec/scripts/scaffold/permissions_yaml_spec.rb
git commit -m "feat(scaffold): idempotent permissions.yml appender"
```

---

## Task 3: ERB templates for the Helm-side files

**Files:**
- Create: `scripts/templates/helm/entity.rb.erb`
- Create: `scripts/templates/helm/hb1_client.rb.erb`
- Create: `scripts/templates/helm/api.rb.erb`
- Create: `scripts/templates/helm/request_spec.rb.erb`
- Create: `scripts/templates/helm/entity_spec.rb.erb`
- Create: `scripts/templates/helm/hb1_client_spec.rb.erb`
- Create: `scripts/templates/helm/lib_typed_api.ts.erb`
- Create: `scripts/templates/helm/index_page.tsx.erb`
- Create: `scripts/templates/helm/show_page.tsx.erb`
- Create: `scripts/templates/helm/index_page_test.tsx.erb`
- Create: `scripts/templates/helm/show_page_test.tsx.erb`
- Create: `scripts/templates/helm/handoff.md.erb`

Each template is a copy of the Plan 2 file with names substituted via `<%= n.foo %>`. Below are the contents.

- [ ] **Step 1: `entity.rb.erb`**

Create `scripts/templates/helm/entity.rb.erb`:

```erb
module Entities
  class <%= n.resource_class %> < Grape::Entity
    PII_FIELDS = %w[].freeze # add PII field names here as the workflow needs them

    expose(:id)         { |obj| obj["id"]         || obj[:id] }
    expose(:name)       { |obj| obj["name"]       || obj[:name] }
    expose(:created_at) { |obj| obj["created_at"] || obj[:created_at] }

    # When PII fields are added, wrap them like Plan 2's User entity:
    #
    # with_options(if: ->(_obj, opts) { opts[:role]&.can?("account.view_pii") }) do
    #   expose(:phone) { |obj| obj["phone"] || obj[:phone] }
    # end

    expose :_redacted do |_obj, opts|
      opts[:role]&.can?("account.view_pii") ? [] : PII_FIELDS
    end
  end
end
```

- [ ] **Step 2: `hb1_client.rb.erb`**

```erb
module Hb1Client
  class <%= n.resource_plural_camel %>
    def self.show(id)
      Base.get("/api/rpa_api/v1/<%= n.resource_plural %>/#{id}")
    end

    def self.search(query)
      Base.get("/api/rpa_api/v1/<%= n.resource_plural %>", params: { q: query })
    end

    # Add per-workflow writes here, mirroring Workflow 1's send_verification_sms /
    # issue_impersonation_token methods. Each is a `Base.post(...)` returning the parsed body.
  end
end
```

- [ ] **Step 3: `api.rb.erb`**

```erb
module HelmApi
  module V1
    class <%= n.api_class %> < Grape::API
      helpers AuthHelpers

      helpers do
        def lookup_admin_user!
          AdminUser.find_by(email: "#{current_principal.role}@helm.local") ||
            AdminUser.create!(
              email:     "#{current_principal.role}@helm.local",
              full_name: current_principal.role,
              role:      current_principal.role
            )
        end
      end

      resource :<%= n.resource_plural %> do
        params do
          optional :q, type: String
        end
        get do
          check_permission!("<%= n.permission_view_key %>", scope: {})
          Hb1Client::<%= n.resource_plural_camel %>.search(params[:q].to_s)
        end

        route_param :id, type: Integer do
          get do
            check_permission!("<%= n.permission_view_key %>", scope: { id: params[:id] })
            obj = Hb1Client::<%= n.resource_plural_camel %>.show(params[:id])
            present obj, with: Entities::<%= n.resource_class %>, role: current_principal
          end

          # Per-workflow writes go here. Each should:
          # 1. check_permission!("<domain>.<verb>_<resource>", scope: ...)
          # 2. Call Hb1Client::<%= n.resource_plural_camel %>.<method>(...)
          # 3. AuditService.record(actor: lookup_admin_user!, workflow: "<%= n.audit_workflow %>",
          #                        action: "<%= n.resource_singular %>.<verb>", resource_type: "<%= n.resource_class %>",
          #                        resource_id: params[:id], payload_after: { ... })
          # 4. present result, with: Entities::<SomeResultEntity>
        end
      end
    end
  end
end
```

- [ ] **Step 4: `request_spec.rb.erb`**

```erb
require "rails_helper"

RSpec.describe "Helm <%= n.api_class %>" do
  let(:base) { "/helm_api/v1/<%= n.resource_plural %>" }

  before do
    ENV["HB1_API_BASE_URL"] = "https://hb1.test"
    ENV["HB1_API_TOKEN"]    = "test-token"
    AdminUser.find_or_create_by!(email: "cs_t1_agent@helm.local") do |u|
      u.full_name = "CS T1"; u.role = "cs_t1_agent"
    end
  end

  describe "GET /helm_api/v1/<%= n.resource_plural %>/:id" do
    it "returns the object for a role with <%= n.permission_view_key %>" do
      stub_request(:get, "https://hb1.test/api/rpa_api/v1/<%= n.resource_plural %>/42")
        .to_return(status: 200, body: { id: 42, name: "Demo" }.to_json,
                   headers: { "Content-Type" => "application/json" })

      get "#{base}/42", headers: { "Cookie" => "HELM_DEMO_ROLE=cs_t1_agent" }
      expect(response).to have_http_status(200)
      body = JSON.parse(response.body)
      expect(body["id"]).to   eq(42)
      expect(body["name"]).to eq("Demo")
    end
  end

  describe "GET /helm_api/v1/<%= n.resource_plural %>?q=" do
    it "returns the search results" do
      stub_request(:get, "https://hb1.test/api/rpa_api/v1/<%= n.resource_plural %>")
        .with(query: { q: "demo" })
        .to_return(status: 200, body: [{ id: 1, name: "Demo" }].to_json,
                   headers: { "Content-Type" => "application/json" })

      get "#{base}?q=demo", headers: { "Cookie" => "HELM_DEMO_ROLE=cs_t1_agent" }
      expect(JSON.parse(response.body).length).to eq(1)
    end
  end

  # Add a permission-denial test, an audit test, and an endpoint-integration test for each
  # per-workflow write — mirror spec/requests/users_spec.rb from Workflow 1.
end
```

- [ ] **Step 5: `entity_spec.rb.erb`**

```erb
require "rails_helper"

RSpec.describe Entities::<%= n.resource_class %> do
  let(:source) { { "id" => 1, "name" => "Demo", "created_at" => "2026-06-09T00:00:00Z" } }

  def principal(role) = PermissionService::Principal.new(id: 1, role: role, stytch_subject: nil)

  it "exposes the basic fields" do
    json = described_class.represent(source, role: principal("cs_t1_agent")).serializable_hash
    expect(json).to include(id: 1, name: "Demo")
    expect(json[:_redacted]).to eq([])
  end

  # Once PII fields are added to PII_FIELDS, add specs that flip view_pii like
  # spec/entities/user_spec.rb from Workflow 1.
end
```

- [ ] **Step 6: `hb1_client_spec.rb.erb`**

```erb
require "rails_helper"

RSpec.describe Hb1Client::<%= n.resource_plural_camel %> do
  before do
    ENV["HB1_API_BASE_URL"] = "https://hb1.test"
    ENV["HB1_API_TOKEN"]    = "test-token"
  end

  describe ".show" do
    it "GETs /api/rpa_api/v1/<%= n.resource_plural %>/:id" do
      stub_request(:get, "https://hb1.test/api/rpa_api/v1/<%= n.resource_plural %>/42")
        .to_return(status: 200, body: { id: 42 }.to_json,
                   headers: { "Content-Type" => "application/json" })
      expect(described_class.show(42)).to eq("id" => 42)
    end
  end

  describe ".search" do
    it "GETs /api/rpa_api/v1/<%= n.resource_plural %> with q" do
      stub_request(:get, "https://hb1.test/api/rpa_api/v1/<%= n.resource_plural %>")
        .with(query: { q: "demo" })
        .to_return(status: 200, body: [{ id: 1 }].to_json,
                   headers: { "Content-Type" => "application/json" })
      expect(described_class.search("demo")).to eq([{ "id" => 1 }])
    end
  end
end
```

- [ ] **Step 7: `lib_typed_api.ts.erb`**

```erb
import { api } from "./api";

export type <%= n.resource_class %>Summary = { id: number; name: string };

export type <%= n.resource_class %>Detail = {
  id: number;
  name: string;
  created_at: string;
  _redacted: string[];
};

export const <%= n.resource_plural %>Api = {
  search: (q: string) => api.get<<%= n.resource_class %>Summary[]>(`/helm_api/v1/<%= n.resource_plural %>?q=${encodeURIComponent(q)}`),
  show:   (id: number | string) => api.get<<%= n.resource_class %>Detail>(`/helm_api/v1/<%= n.resource_plural %>/${id}`),
};
```

- [ ] **Step 8: `index_page.tsx.erb`**

```erb
import { useState, useMemo, useEffect } from "react";
import { Link as RouterLink } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Box, List, ListItemButton, ListItemText, TextField, Typography, CircularProgress } from "@mui/material";
import { <%= n.resource_plural %>Api, <%= n.resource_class %>Summary } from "../../lib/<%= n.resource_plural %>";

function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return debounced;
}

export function <%= n.page_dir %>IndexPage() {
  const [q, setQ] = useState("");
  const debounced = useDebounced(q, 250);

  const { data, isFetching } = useQuery({
    queryKey: ["<%= n.resource_plural %>", "search", debounced],
    queryFn: () => <%= n.resource_plural %>Api.search(debounced),
    enabled: debounced.length >= 1,
  });

  const results = useMemo(() => data ?? [], [data]);

  return (
    <Box>
      <Typography variant="h5" gutterBottom><%= n.page_dir %></Typography>
      <TextField label="Search" value={q} onChange={(e) => setQ(e.target.value)} fullWidth autoFocus />
      <Box mt={2}>
        {isFetching && <CircularProgress size={20} />}
        {!isFetching && debounced.length >= 1 && results.length === 0 && (
          <Typography color="text.secondary">No results.</Typography>
        )}
        <List>
          {results.map((r: <%= n.resource_class %>Summary) => (
            <ListItemButton key={r.id} component={RouterLink} to={`/<%= n.resource_plural %>/${r.id}`}>
              <ListItemText primary={r.name} secondary={`#${r.id}`} />
            </ListItemButton>
          ))}
        </List>
      </Box>
    </Box>
  );
}
```

- [ ] **Step 9: `show_page.tsx.erb`**

```erb
import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Box, Card, CardContent, CircularProgress, Divider, Stack, Tab, Tabs, Typography } from "@mui/material";
import { useState } from "react";
import { <%= n.resource_plural %>Api } from "../../lib/<%= n.resource_plural %>";
import { AuditTrailTab } from "../../components/AuditTrailTab";

export function <%= n.page_dir %>ShowPage() {
  const { id } = useParams<{ id: string }>();
  const resourceId = Number(id);
  const [tab, setTab] = useState<"profile" | "audit">("profile");

  const { data, isLoading } = useQuery({
    queryKey: ["<%= n.resource_plural %>", resourceId],
    queryFn: () => <%= n.resource_plural %>Api.show(resourceId),
  });

  if (isLoading || !data) return <CircularProgress />;

  return (
    <Box>
      <Typography variant="h5">{data.name}</Typography>

      {/* Per-workflow action buttons gated by usePermission go here. */}

      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mt: 3 }}>
        <Tab value="profile" label="Profile" />
        <Tab value="audit"   label="Audit trail" />
      </Tabs>
      <Divider />

      {tab === "profile" && (
        <Card sx={{ mt: 2 }}>
          <CardContent>
            <Stack direction="row" spacing={2} py={0.5}>
              <Typography sx={{ width: 160 }} color="text.secondary">Created at</Typography>
              <Typography>{data.created_at}</Typography>
            </Stack>
            {/* Add fields here — PII fields should render via <PiiField name="..." value={...} redactedFields={data._redacted} /> */}
          </CardContent>
        </Card>
      )}

      {tab === "audit" && <AuditTrailTab resourceType="<%= n.resource_class %>" resourceId={resourceId} />}
    </Box>
  );
}
```

- [ ] **Step 10: `index_page_test.tsx.erb`**

```erb
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { <%= n.page_dir %>IndexPage } from "./IndexPage";

function wrap(ui: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={client}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});

describe("<%= n.page_dir %>IndexPage", () => {
  it("renders search results from the API", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => [{ id: 1, name: "Demo" }],
    } as Response);

    render(wrap(<<%= n.page_dir %>IndexPage />));
    fireEvent.change(screen.getByLabelText(/search/i), { target: { value: "demo" } });

    await waitFor(() => expect(screen.getByText("Demo")).toBeInTheDocument());
  });
});
```

- [ ] **Step 11: `show_page_test.tsx.erb`**

```erb
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { PermissionContext } from "../../lib/permissions";
import { <%= n.page_dir %>ShowPage } from "./ShowPage";

function wrap(ui: React.ReactNode, role: string, permissions: string[]) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={client}>
      <PermissionContext.Provider value={{ role, permissions, available_roles: [] }}>
        <MemoryRouter initialEntries={["/<%= n.resource_plural %>/42"]}>
          <Routes>
            <Route path="/<%= n.resource_plural %>/:id" element={ui} />
          </Routes>
        </MemoryRouter>
      </PermissionContext.Provider>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});

describe("<%= n.page_dir %>ShowPage", () => {
  it("renders the resource's basic fields", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ id: 42, name: "Demo", created_at: "2026-06-09T00:00:00Z", _redacted: [] }),
    } as Response);

    render(wrap(<<%= n.page_dir %>ShowPage />, "cs_t1_agent", ["<%= n.permission_view_key %>"]));

    await waitFor(() => expect(screen.getByText("Demo")).toBeInTheDocument());
  });
});
```

- [ ] **Step 12: `handoff.md.erb`**

```erb
# <%= n.page_dir %> workflow

**Status:** Scaffolded by `scripts/scaffold-workflow.rb` on <%= Time.now.utc.strftime("%Y-%m-%d") %>. Code is a skeleton — fill in writes, audit calls, and React details.

## Required next steps

1. Decide which **PII fields** belong to `<%= n.resource_class %>`. Add their string keys to `PII_FIELDS` in `app/api/entities/<%= n.resource_singular %>.rb` and add `expose` lines guarded by `with_options(if: ...)`. Mirror `app/api/entities/user.rb`.
2. Decide which **writes** the workflow needs (e.g. `change_tier`, `archive_jobs`). For each:
   - Add a `Hb1Client::<%= n.resource_plural_camel %>.<verb>(...)` method.
   - Add a `post :<verb> do ... end` block in `app/api/helm_api/v1/<%= n.workflow_snake %>_api.rb`, calling `check_permission!`, the client, then `AuditService.record`.
   - Add a request spec in `spec/requests/<%= n.workflow_snake %>_spec.rb` covering: 403 for a role that can't, 200 for a role that can, audit row created.
3. Decide which **permission keys** are needed beyond `<%= n.permission_view_key %>`. Add them to `config/permissions.yml` and assign to the roles that should hold them.
4. Mount the new `<%= n.api_class %>` in `app/api/helm_api/v1/base.rb`:
   ```ruby
   mount HelmApi::V1::<%= n.api_class %>
   ```
5. Add a route + nav link in `client-helm/src/App.tsx`:
   ```tsx
   <Button component={RouterLink} to="/<%= n.resource_plural %>" size="small"><%= n.page_dir %></Button>
   ...
   <Route path="/<%= n.resource_plural %>"     element={<<%= n.page_dir %>IndexPage />} />
   <Route path="/<%= n.resource_plural %>/:id" element={<<%= n.page_dir %>ShowPage />} />
   ```

## Required tests (one of each, mirror Workflow 1)

- `spec/services/permission_service_spec.rb` — already covers role × permission. Add rows if you introduce new permission keys.
- `spec/entities/<%= n.resource_singular %>_spec.rb` — entity PII gating (when you add PII fields).
- `spec/requests/<%= n.workflow_snake %>_spec.rb` — endpoint integration via WebMock.
- `spec/services/hb1_client/<%= n.resource_plural %>_spec.rb` — Hb1Client method wrappers.

Plus one Vitest per React page/component.

## HB1 changes

This workflow needs corresponding endpoints on HB1. Use `docs/handoff/hb1-workflow1-user-lookup.md` as the template and adapt for `<%= n.resource_singular %>`. Specifically:
1. Extract per-action service objects from `app/admin/<%= n.resource_plural %>.rb` (HB1 side).
2. Add Grape POST routes under `app/api/rpa_api/v1/<%= n.resource_plural %>_api.rb` that call them.
3. Verify `GET /api/rpa_api/v1/<%= n.resource_plural %>/:id` exposes the fields Helm's `Entities::<%= n.resource_class %>` consumes.

## Worked example

`docs/handoff/user_lookup.md` shows the fully-fleshed-out version of this template for Workflow 1.
```

- [ ] **Step 13: Commit all 12 templates**

```bash
git add scripts/templates/helm/
git commit -m "feat(scaffold): Helm-side ERB templates (entity/api/hb1_client/specs/pages/handoff)"
```

---

## Task 4: HB1-side `.template` files (copy-paste material)

**Files:**
- Create: `scripts/templates/hb1/rpa_api.rb.template`
- Create: `scripts/templates/hb1/service.rb.template`
- Create: `scripts/templates/hb1/entity.rb.template`
- Create: `scripts/templates/hb1/handoff.md.template`

These are NOT ERB-rendered — they're shipped verbatim with `__WORKFLOW__` / `__RESOURCE__` / `__PACK__` placeholders the HB1 engineer find-and-replaces manually. Reason: the scaffold can't safely write into a different repo, but it can produce ready-to-paste files.

- [ ] **Step 1: `rpa_api.rb.template`**

Create `scripts/templates/hb1/rpa_api.rb.template`:

```ruby
# Drop this into app/api/rpa_api/v1/__RESOURCES__/_api.rb or extend the existing file.
# Find/replace: __RESOURCE__ (singular), __RESOURCES__ (plural), __VERB__ (action name).

module RpaApi
  module V1
    class __RESOURCES_CAMEL__Api < ::Grape::API
      resource :__RESOURCES__ do
        route_param :id, type: Integer do
          desc "__VERB_HUMAN__ for __RESOURCE__"
          post :__VERB__ do
            obj    = __RESOURCE_CAMEL__.find(params[:id])
            result = __PACK_CAMEL__::__RESOURCES_CAMEL__::__VERB_CAMEL__.call(__RESOURCE__: obj)
            present(result, with: Entities::__VERB_CAMEL__Result)
          end
        end
      end
    end
  end
end
```

- [ ] **Step 2: `service.rb.template`**

Create `scripts/templates/hb1/service.rb.template`:

```ruby
# Drop this into app/services/__PACK__/__RESOURCES__/__VERB__.rb
# Find/replace: __PACK__, __PACK_CAMEL__, __RESOURCES__, __RESOURCES_CAMEL__,
#               __RESOURCE__, __RESOURCE_CAMEL__, __VERB__, __VERB_CAMEL__

module __PACK_CAMEL__
  module __RESOURCES_CAMEL__
    class __VERB_CAMEL__
      Result = Struct.new(:performed_at, :provider_request_id, keyword_init: true)

      def self.call(__RESOURCE__:)
        new(__RESOURCE__).call
      end

      def initialize(__RESOURCE__)
        @__RESOURCE__ = __RESOURCE__
      end

      def call
        # PASTE the existing logic from app/admin/__RESOURCES__.rb's `__VERB__` member_action here.
        # Replace local `__RESOURCE__` references with `@__RESOURCE__`. Capture whatever the underlying
        # implementation returns and surface it on Result. ActiveAdmin's action body should
        # become a single `__PACK_CAMEL__::__RESOURCES_CAMEL__::__VERB_CAMEL__.call(__RESOURCE__: resource)`.

        Result.new(
          performed_at:        Time.current,
          provider_request_id: nil
        )
      end
    end
  end
end
```

- [ ] **Step 3: `entity.rb.template`**

Create `scripts/templates/hb1/entity.rb.template`:

```ruby
# Drop this into app/api/rpa_api/v1/entities/__VERB___result.rb
# Find/replace: __VERB__, __VERB_CAMEL__

module RpaApi
  module V1
    module Entities
      class __VERB_CAMEL__Result < Grape::Entity
        expose :performed_at do |obj|
          obj.performed_at.iso8601
        end
        expose :provider_request_id
      end
    end
  end
end
```

- [ ] **Step 4: `handoff.md.template`**

Create `scripts/templates/hb1/handoff.md.template`:

```markdown
# HB1 changes for the __RESOURCE__ workflow

Use `docs/handoff/hb1-workflow1-user-lookup.md` (Helm repo) as the reference. For this workflow:

1. Run `grep -n __VERB__ app/admin/__RESOURCES__.rb` to locate the existing action.
2. Extract its body into `app/services/__PACK__/__RESOURCES__/__VERB__.rb` (use `scripts/templates/hb1/service.rb.template` from the Helm repo, find/replace placeholders).
3. Add the POST route to `app/api/rpa_api/v1/__RESOURCES__/_api.rb` (use `scripts/templates/hb1/rpa_api.rb.template`).
4. Create the result entity (use `scripts/templates/hb1/entity.rb.template`).
5. Replace the admin action body with a call to the new service.
6. Run `bundle exec rspec spec/services/__PACK__/__RESOURCES__/__VERB___spec.rb spec/requests/api/rpa_api/v1/__RESOURCES___api_spec.rb`.
```

- [ ] **Step 5: Commit**

```bash
git add scripts/templates/hb1/
git commit -m "feat(scaffold): HB1-side .template files (find/replace placeholders, manual paste)"
```

---

## Task 5: The Generator (ERB orchestration)

**Files:**
- Create: `scripts/lib/scaffold/generator.rb`
- Create: `spec/scripts/scaffold/generator_spec.rb`

- [ ] **Step 1: Write the failing generator spec**

Create `spec/scripts/scaffold/generator_spec.rb`:

```ruby
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
```

- [ ] **Step 2: Run — should fail**

```bash
bundle exec rspec spec/scripts/scaffold/generator_spec.rb
```

Expected: `cannot load such file`.

- [ ] **Step 3: Implement the Generator**

Create `scripts/lib/scaffold/generator.rb`:

```ruby
require "erb"
require "fileutils"

module Scaffold
  class Generator
    TEMPLATE_ROOT = File.expand_path("../../templates", __dir__)

    HELM_TEMPLATES = [
      # [erb_relative, target_relative_path_proc]
      ["helm/entity.rb.erb",          ->(n) { "app/api/entities/#{n.resource_singular}.rb" }],
      ["helm/hb1_client.rb.erb",      ->(n) { "app/services/hb1_client/#{n.resource_plural}.rb" }],
      ["helm/api.rb.erb",             ->(n) { "app/api/helm_api/v1/#{n.workflow_snake}_api.rb" }],
      ["helm/request_spec.rb.erb",    ->(n) { "spec/requests/#{n.workflow_snake}_spec.rb" }],
      ["helm/entity_spec.rb.erb",     ->(n) { "spec/entities/#{n.resource_singular}_spec.rb" }],
      ["helm/hb1_client_spec.rb.erb", ->(n) { "spec/services/hb1_client/#{n.resource_plural}_spec.rb" }],
      ["helm/lib_typed_api.ts.erb",   ->(n) { "client-helm/src/lib/#{n.resource_plural}.ts" }],
      ["helm/index_page.tsx.erb",     ->(n) { "client-helm/src/pages/#{n.page_dir}/IndexPage.tsx" }],
      ["helm/show_page.tsx.erb",      ->(n) { "client-helm/src/pages/#{n.page_dir}/ShowPage.tsx" }],
      ["helm/index_page_test.tsx.erb",->(n) { "client-helm/src/pages/#{n.page_dir}/IndexPage.test.tsx" }],
      ["helm/show_page_test.tsx.erb", ->(n) { "client-helm/src/pages/#{n.page_dir}/ShowPage.test.tsx" }],
      ["helm/handoff.md.erb",         ->(n) { "docs/handoff/#{n.workflow_snake}.md" }],
    ].freeze

    HB1_TEMPLATES = %w[rpa_api.rb.template service.rb.template entity.rb.template handoff.md.template].freeze

    def initialize(root:, naming:)
      @root = root
      @n    = naming
    end

    def run!
      render_helm_templates!
      copy_hb1_templates!
      append_permissions!
    end

    private

    def render_helm_templates!
      HELM_TEMPLATES.each do |template_rel, target_proc|
        template = File.read(File.join(TEMPLATE_ROOT, template_rel))
        rendered = ERB.new(template, trim_mode: "-").result(binding_for_template)
        target = File.join(@root, target_proc.call(@n))
        FileUtils.mkdir_p(File.dirname(target))
        File.write(target, rendered)
      end
    end

    def copy_hb1_templates!
      out_dir = File.join(@root, "tmp", "hb1-out", @n.workflow_snake)
      FileUtils.mkdir_p(out_dir)
      HB1_TEMPLATES.each do |name|
        FileUtils.cp(File.join(TEMPLATE_ROOT, "hb1", name), File.join(out_dir, name))
      end
    end

    def append_permissions!
      yml = File.join(@root, "config/permissions.yml")
      PermissionsYaml.new(yml).append!(
        new_permissions: [{ key: @n.permission_view_key, scope: scope_for(@n.resource_singular) }]
      )
    end

    def scope_for(resource)
      case resource
      when "user"     then "human"
      when "company"  then "company"
      when "location" then "location"
      else "object"
      end
    end

    def binding_for_template
      n = @n
      Kernel.binding
    end
  end
end
```

- [ ] **Step 4: Run — should pass**

```bash
bundle exec rspec spec/scripts/scaffold/generator_spec.rb
```

Expected: 4 examples, 0 failures.

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/scaffold/generator.rb spec/scripts/scaffold/generator_spec.rb
git commit -m "feat(scaffold): Generator that renders ERB templates + idempotent permissions append"
```

---

## Task 6: The CLI

**Files:**
- Create: `scripts/scaffold-workflow.rb`

- [ ] **Step 1: Write the CLI entry point**

Create `scripts/scaffold-workflow.rb`:

```ruby
#!/usr/bin/env ruby
# Usage: scripts/scaffold-workflow.rb <workflow_snake> <resource_snake>
# Example: scripts/scaffold-workflow.rb company_merchant company

require "optparse"
require_relative "lib/scaffold/naming"
require_relative "lib/scaffold/permissions_yaml"
require_relative "lib/scaffold/generator"

opts = { root: File.expand_path("..", __dir__) }
parser = OptionParser.new do |o|
  o.banner = "Usage: scripts/scaffold-workflow.rb <workflow_snake> <resource_snake> [--root DIR]"
  o.on("--root DIR", "Helm repo root (default: this repo)") { |v| opts[:root] = v }
end
parser.parse!

unless ARGV.length == 2
  warn parser.help
  exit 1
end

workflow, resource = ARGV
naming    = Scaffold::Naming.new(workflow: workflow, resource: resource)
generator = Scaffold::Generator.new(root: opts[:root], naming: naming)
generator.run!

puts <<~OUT
  Scaffolded #{workflow} (#{resource}).

  Files written under #{opts[:root]}:
    app/api/entities/#{naming.resource_singular}.rb
    app/api/helm_api/v1/#{naming.workflow_snake}_api.rb
    app/services/hb1_client/#{naming.resource_plural}.rb
    spec/entities/#{naming.resource_singular}_spec.rb
    spec/requests/#{naming.workflow_snake}_spec.rb
    spec/services/hb1_client/#{naming.resource_plural}_spec.rb
    client-helm/src/lib/#{naming.resource_plural}.ts
    client-helm/src/pages/#{naming.page_dir}/{IndexPage,ShowPage,IndexPage.test,ShowPage.test}.tsx
    docs/handoff/#{naming.workflow_snake}.md
    tmp/hb1-out/#{naming.workflow_snake}/*.template

  Next steps (from docs/handoff/#{naming.workflow_snake}.md):
    1. Mount HelmApi::V1::#{naming.api_class} in app/api/helm_api/v1/base.rb
    2. Add /#{naming.resource_plural} route + nav link in client-helm/src/App.tsx
    3. Implement per-workflow writes (Hb1Client method + Grape POST + audit)
    4. Add roles to config/permissions.yml that should have #{naming.permission_view_key}
    5. Hand the tmp/hb1-out/ templates to the HB1 owner of #{naming.resource_singular}

  Run: bundle exec rspec spec/requests/#{naming.workflow_snake}_spec.rb && \\
       (cd client-helm && bun run test src/pages/#{naming.page_dir})
OUT
```

- [ ] **Step 2: Make executable**

```bash
chmod +x scripts/scaffold-workflow.rb
```

- [ ] **Step 3: Dry-run smoke against a throwaway workflow**

```bash
mkdir -p /tmp/helm-scaffold-smoke && cp -r config /tmp/helm-scaffold-smoke/
scripts/scaffold-workflow.rb test_workflow widget --root /tmp/helm-scaffold-smoke
ls /tmp/helm-scaffold-smoke/app/api/helm_api/v1/
cat /tmp/helm-scaffold-smoke/app/api/entities/widget.rb | head -20
rm -rf /tmp/helm-scaffold-smoke
```

Expected: `test_workflow_api.rb` exists; entity file shows `module Entities; class Widget < Grape::Entity`.

- [ ] **Step 4: Commit**

```bash
git add scripts/scaffold-workflow.rb
git commit -m "feat(scaffold): scripts/scaffold-workflow.rb CLI"
```

---

## Task 7: `docs/handoff/TEMPLATE.md` (the master checklist)

**Files:**
- Create: `docs/handoff/TEMPLATE.md`

- [ ] **Step 1: Write the template**

Create `docs/handoff/TEMPLATE.md`:

```markdown
# Migrating a workflow into Helm — checklist

Read `docs/handoff/user_lookup.md` first — it's the worked example. This file is the bare checklist
you copy into a per-workflow handoff doc.

## 1. Scaffold

```bash
scripts/scaffold-workflow.rb <workflow_snake> <resource_snake>
```

Writes Helm-side skeletons under `app/`, `client-helm/src/`, and `spec/`. Drops HB1-side
find/replace templates under `tmp/hb1-out/<workflow>/`.

## 2. Decide the writes

For each "this admin can do X to a <resource>" verb (e.g. `verify_phone`, `change_tier`,
`archive_jobs`), you'll add:

- An HB1 service object under `app/services/<pack>/<resources>/<verb>.rb`
- An HB1 Grape POST route under `app/api/rpa_api/v1/<resources>_api.rb`
- A `Hb1Client::<Resources>.<verb>` method in the Helm repo
- A `post :<verb> do ... end` block in `app/api/helm_api/v1/<workflow>_api.rb`
- A React button + onClick wired to the new endpoint, gated by `usePermission("...")`

## 3. Permissions

Edit `config/permissions.yml`:

- Add new permission keys under the `permissions:` list (use `<domain>.<verb>_<resource>` form).
- Assign each new key to the roles that should hold it.
- Restart Rails. No code review needed for permission moves.

## 4. PII

In `app/api/entities/<resource>.rb`:

- Add the field names that are PII to the `PII_FIELDS` constant.
- For each, add an `expose(:field)` line inside a `with_options(if: ...)` block gated on
  `opts[:role]&.can?("account.view_pii")`. (See `app/api/entities/user.rb`.)

## 5. Audit

Every write must call `AuditService.record` with `workflow:`, `action:` (use `<resource>.<verb>` form),
`resource_type:`, `resource_id:`, and a `payload_after:` Hash describing what changed. The audit row
shows up in the React `AuditTrailTab` automatically.

## 6. Wire the routes

- `app/api/helm_api/v1/base.rb` — add `mount HelmApi::V1::<...>Api`
- `client-helm/src/App.tsx` — add nav `<Button>` and `<Route path=".../">`

## 7. Tests (four required per workflow)

1. **Permission test** — add rows to `spec/services/permission_service_spec.rb` for any new roles × keys.
2. **Entity PII test** — in `spec/entities/<resource>_spec.rb`, assert PII absence/presence flips with role.
3. **Endpoint integration test** — in `spec/requests/<workflow>_spec.rb`, stub HB1 via WebMock, assert
   permission 403s, the success path 200s, and audit row count went up by 1.
4. **Audit test** — usually folded into #3 with `.to change(AuditEvent, :count).by(1)`.

## 8. Datadog

Anything high-sensitivity (impersonation, billing change, mass delete) should `Datadog::Statsd.increment`
with a counter so we can dashboard + alert on it. (See `app/services/audit_service.rb` for the lograge
+ statsd pattern that's already established.)

## 9. HB1

Hand `tmp/hb1-out/<workflow>/*.template` to the HB1 owner. They follow the Strangler Fig pattern:
extract service from `app/admin/<resource>.rb` → add Grape route that calls it → admin action body
becomes a one-line `Service.call(...)`. Reference doc: `docs/handoff/hb1-workflow1-user-lookup.md`.

## 10. Demo it

`bin/dev` boots Rails + Vite. Browse `localhost:5173`. Use the RoleSwitcher to flip into a role
that has and a role that doesn't have each permission. Watch the buttons appear/disappear and
the audit tab fill.
```

- [ ] **Step 2: Commit**

```bash
git add docs/handoff/TEMPLATE.md
git commit -m "docs(handoff): TEMPLATE.md — per-pack-team migration checklist"
```

---

## Task 8: `docs/handoff/user_lookup.md` (worked example, retroactively validated)

**Files:**
- Create: `docs/handoff/user_lookup.md`

- [ ] **Step 1: Generate the scaffold output for `user_lookup user` into a tmp dir**

```bash
mkdir -p /tmp/helm-workflow1-validate && cp -r config /tmp/helm-workflow1-validate/
scripts/scaffold-workflow.rb user_lookup user --root /tmp/helm-workflow1-validate
```

- [ ] **Step 2: Diff the scaffolded output against the real Plan 2 code**

```bash
diff /tmp/helm-workflow1-validate/app/api/entities/user.rb            app/api/entities/user.rb            > /tmp/diff-entity.txt    || true
diff /tmp/helm-workflow1-validate/app/services/hb1_client/users.rb     app/services/hb1_client/users.rb     > /tmp/diff-client.txt    || true
diff /tmp/helm-workflow1-validate/app/api/helm_api/v1/user_lookup_api.rb app/api/helm_api/v1/users_api.rb  > /tmp/diff-api.txt        || true
ls /tmp/diff-*.txt | xargs -I{} sh -c 'echo "=== {} ==="; cat {}'
```

Expected: diffs show that the **scaffold skeleton** is a strict subset of what's in the **completed Plan 2 code**. Specifically:
- `entity.rb`: scaffolded version has no PII fields and `PII_FIELDS = []`; real version has 3 PII fields.
- `hb1_client.rb`: scaffolded has show + search; real has show + search + send_verification_sms + issue_impersonation_token.
- `api.rb`: scaffolded has GET show + GET search; real adds POST verification_sms + POST impersonate.

These deltas ARE the worked example — every gap between scaffold and reality is something the engineer needs to fill in. Note them down for step 3.

- [ ] **Step 3: Write the worked-example doc**

Create `docs/handoff/user_lookup.md`:

```markdown
# Worked example — User Account Lookup (Workflow 1)

This is what `scripts/scaffold-workflow.rb user_lookup user` produces, then how the deltas were filled in to get to the actual code that ships under `helm-workflow1-v1-helm-only`.

If you're starting a new workflow, follow `docs/handoff/TEMPLATE.md` step-by-step. This doc shows what "filled in" looks like.

## What the scaffold produced

After running `scripts/scaffold-workflow.rb user_lookup user`, you get:

- `app/api/entities/user.rb` — entity with `id`, `name`, `created_at` only. No PII. `_redacted` always empty.
- `app/api/helm_api/v1/user_lookup_api.rb` — `UsersApi` Grape class with `GET /users` (search) and `GET /users/:id` (show). No POST routes.
- `app/services/hb1_client/users.rb` — `Hb1Client::Users` with `.show(id)` and `.search(q)`. No write methods.
- Specs that test the read paths but no audit.
- `client-helm/src/lib/users.ts` and the IndexPage / ShowPage scaffolds.
- `docs/handoff/user_lookup.md` (overwritten by this doc).
- `tmp/hb1-out/user_lookup/` with `.template` files for HB1.

## Deltas to reach the shipping version

### Delta 1: Entity — add PII gating

In `app/api/entities/user.rb`:

```ruby
PII_FIELDS = %w[phone ssn_last4 bank_last4].freeze

expose(:email)           { |obj| obj["email"]           || obj[:email] }
expose(:full_name)       { |obj| obj["full_name"]       || obj[:full_name] }
expose(:last_sign_in_at) { |obj| obj["last_sign_in_at"] || obj[:last_sign_in_at] }
expose(:stytch_subject)  { |obj| obj["stytch_subject"]  || obj[:stytch_subject] }

with_options(if: ->(_obj, opts) { opts[:role]&.can?("account.view_pii") }) do
  expose(:phone)      { |obj| obj["phone"]      || obj[:phone] }
  expose(:ssn_last4)  { |obj| obj["ssn_last4"]  || obj[:ssn_last4] }
  expose(:bank_last4) { |obj| obj["bank_last4"] || obj[:bank_last4] }
end
```

The corresponding `spec/entities/user_spec.rb` adds two tests asserting PII absence for `cs_t1_agent` and presence for `cs_t2_payroll`.

### Delta 2: Hb1Client — add the write wrappers

In `app/services/hb1_client/users.rb`:

```ruby
def self.send_verification_sms(id)
  Base.post("/api/rpa_api/v1/users/#{id}/verification_sms")
end

def self.issue_impersonation_token(id)
  Base.post("/api/rpa_api/v1/users/#{id}/impersonation_token")
end
```

Spec adds two stubbed POST examples.

### Delta 3: BFF — add the write endpoints + audit

In `app/api/helm_api/v1/user_lookup_api.rb` (rename to `users_api.rb` to match the resource), inside `route_param :id`:

```ruby
post :verification_sms do
  check_permission!("account.verify_phone", scope: { human_id: params[:id] })
  result = Hb1Client::Users.send_verification_sms(params[:id])
  AuditService.record(
    actor: lookup_admin_user!,
    workflow: "user_lookup",
    action: "user.verification_sms_sent",
    resource_type: "User", resource_id: params[:id],
    payload_after: { sent_at: result["sent_at"], provider_request_id: result["provider_request_id"] }
  )
  present result, with: Entities::VerificationResult
end

post :impersonate do
  check_permission!("account.impersonate_user", scope: { human_id: params[:id] })
  token = Hb1Client::Users.issue_impersonation_token(params[:id])
  AuditService.record(
    actor: lookup_admin_user!,
    workflow: "user_lookup",
    action: "user.impersonation_started",
    resource_type: "User", resource_id: params[:id],
    payload_after: { expires_at: token["expires_at"] }
  )
  present token, with: Entities::ImpersonationToken
end
```

The `Entities::VerificationResult` and `Entities::ImpersonationToken` small entities live in `app/api/entities/`.

### Delta 4: Permissions — add the per-workflow keys

In `config/permissions.yml`, the scaffold added `account.view_user` (already existed). Add:

```yaml
- { key: account.verify_phone,     scope: human }
- { key: account.impersonate_user, scope: human }
```

Then assign:
- `account.verify_phone` to: `cs_t1_agent`, `cs_t2_payroll`, `cs_t2_payments`, `cs_t2_escalations`, `eng_general`, `eng_super`
- `account.impersonate_user` to: `cs_t2_escalations`, `eng_super`

### Delta 5: React — add the action buttons + impersonate modal

In `client-helm/src/pages/UserLookup/ShowPage.tsx`, add:

```tsx
const canVerify      = usePermission("account.verify_phone");
const canImpersonate = usePermission("account.impersonate_user");
// ...
{canVerify     && <Button onClick={() => verify.mutate()}>Verify SMS</Button>}
{canImpersonate && <Button color="warning" onClick={() => setImpOpen(true)}>Impersonate</Button>}
```

Create `client-helm/src/pages/UserLookup/ImpersonateModal.tsx` — a confirm dialog that POSTs to `/helm_api/v1/users/:id/impersonate` and `window.open`s the returned URL in a new tab.

### Delta 6: HB1

Pick up `tmp/hb1-out/user_lookup/` templates and apply them in `~/Homebase1`. Or follow the
ready-made `docs/handoff/hb1-workflow1-user-lookup.md` which has the verbatim service code already
documented for Workflow 1.

## What you should see at the end

A demo that:

1. As `cs_t1_agent`: PII masked. Verify SMS button visible (button → 403 in Plan 2 because cs_t1 has `account.verify_phone`; flip the YAML if you want to see a 403).
2. As `cs_t2_payroll`: PII visible. Impersonate button NOT visible.
3. As `cs_t2_escalations`: PII visible. Impersonate button visible. Click → confirm → new tab opens to HB1's `login_as` URL. Audit trail shows the row.
4. Edit `config/permissions.yml`, remove `account.impersonate_user` from `cs_t2_escalations`, restart, reload — button vanishes.

That's the canonical end state. Workflows 2 and 3 mirror this shape; the deltas they need will differ (no impersonation for Location Management, for instance) but the steps are the same.
```

- [ ] **Step 4: Commit**

```bash
git add docs/handoff/user_lookup.md
git commit -m "docs(handoff): worked example for User Account Lookup (Workflow 1)"
```

---

## Task 9: README + scaffold usage

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Add a "Scaffolding a new workflow" section**

In `README.md`, before the "Plans" section, add:

```markdown
## Scaffolding a new workflow

When a pack team wants to migrate a workflow from ActiveAdmin into Helm:

```bash
scripts/scaffold-workflow.rb <workflow_snake> <resource_snake>
# e.g.
scripts/scaffold-workflow.rb company_merchant company
```

This stamps out entity / Hb1Client / BFF API / React pages / specs / handoff doc, and appends
`account.view_<resource>` to `config/permissions.yml` (idempotently). HB1-side `.template`
files land in `tmp/hb1-out/<workflow>/`.

Then follow `docs/handoff/<workflow>.md`. The fully-worked example lives in `docs/handoff/user_lookup.md`.

## Handoff docs

- `docs/handoff/TEMPLATE.md` — the per-team migration checklist
- `docs/handoff/user_lookup.md` — Workflow 1 worked example
- `docs/handoff/hb1-workflow1-user-lookup.md` — HB1 changes required for Workflow 1
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs(helm): README — scaffolding a new workflow + handoff docs index"
```

---

## Task FINAL: Full suite + tag

- [ ] **Step 1: Run all backend specs**

```bash
cd ~/helm/helm
bundle exec rspec
```

Expected: all green, including the new scaffold specs (Naming + PermissionsYaml + Generator = ~10 examples).

- [ ] **Step 2: Sanity-check scaffold output by generating something throwaway and running its specs**

```bash
scripts/scaffold-workflow.rb sample_workflow widget --root /tmp/helm-sample-out
ls /tmp/helm-sample-out
cat /tmp/helm-sample-out/docs/handoff/sample_workflow.md | head -30
rm -rf /tmp/helm-sample-out
```

Expected: directories populated, handoff doc legible.

- [ ] **Step 3: Tag**

```bash
git tag helm-scaffold-v1
```

---

## Done with Plan 3

- `scripts/scaffold-workflow.rb workflow resource` stamps out a complete BFF-plus-React skeleton with passing specs.
- `docs/handoff/TEMPLATE.md` is the per-pack-team checklist; `docs/handoff/user_lookup.md` is the worked example with deltas spelled out.
- `tmp/hb1-out/<workflow>/` carries HB1 `.template` files for find/replace.
- `PermissionsYaml.append!` is idempotent — safe to re-run the scaffold.
- The Generator spec asserts no unrendered ERB tags leak through, so scaffold output is always loadable.

**Next:** Plan 4 builds Workflow 2 (Company / Merchant Profile) by running this scaffold, then filling the deltas. The fact that Plan 4 finds gaps in the scaffold is the signal — fix them in Plan 4, then Plan 5 (Location Management) runs cleaner. After Plans 4 and 5, the handoff toolkit is genuinely battle-tested.
