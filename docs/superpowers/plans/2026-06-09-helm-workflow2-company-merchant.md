# Helm Workflow 2 — Company Account & Merchant Profile Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Demo the Company / Merchant Profile workflow (26.5% of admin traffic) end-to-end: search a company, view its merchant profile in one composite view, change the billing tier with full before/after audit, all behind role-keyed PII for billing-sensitive fields. Built by running `scripts/scaffold-workflow.rb company_merchant company` first, then filling in the deltas the worked-example doc enumerates.

**Architecture:** Same shape as Workflow 1 — `Entities::Company` with PII gating, `Hb1Client::Companies` for the four HB1 calls, `HelmApi::V1::CompanyMerchantApi` with permission/audit. New shapes this plan introduces:

1. **Sub-resource endpoint** — `GET /helm_api/v1/companies/:id/merchant_profile` returns a composite payload (billing state + payment method + tier + recent invoices) sourced from a single HB1 call. The scaffold gave us top-level show/search; this is the first time we add a `route_param :id do; get :merchant_profile do ... end` route.
2. **Composite Show page** — Unlike User Lookup where the audit tab is the only sibling tab, Company Show inlines merchant profile data into the same view. The React page calls two queries: `/companies/:id` and `/companies/:id/merchant_profile`, joined client-side.
3. **Before/after audit payload** — `company.billing_tier_changed` records `payload_before: { tier: "starter" }, payload_after: { tier: "professional" }`. Workflow 1 only used `payload_after`. The `ChangeTierDrawer` UI must fetch the current tier before submitting so the BFF can pass both values to `AuditService.record`.

**Tech Stack:** No new gems or packages. Same Rails/Grape/Faraday/RSpec/WebMock + React/MUI/react-query/react-router. The scaffold generator handles file creation; this plan fills in workflow-specific code.

**Plan dependencies (must be complete):**
- `helm-scaffold-v1` tag — `scripts/scaffold-workflow.rb` works
- `helm-workflow1-v1-helm-only` tag — Workflow 1 sets the pattern this one mirrors

**Repo layout this plan touches:**

```
~/Homebase1/                                                   (skipped by default — Section A is handoff doc only)
  app/services/billing/merchant_profile_service.rb             ← extract from app/presenters/merchant_profile_presenter.rb
  app/services/billing/tier_change_service.rb                  ← extract from app/admin/biller/*
  app/api/rpa_api/v1/companies_api.rb                          ← add 2 routes

~/helm/helm/
  app/api/entities/company.rb                                  ← scaffold writes, this plan extends with PII
  app/api/entities/merchant_profile.rb                         ← new (the composite payload)
  app/api/entities/billing_tier_change.rb                      ← new (the write response)
  app/api/helm_api/v1/company_merchant_api.rb                  ← scaffold writes, this plan adds 2 routes
  app/api/helm_api/v1/base.rb                                  ← mount HelmApi::V1::CompanyMerchantApi
  app/services/hb1_client/companies.rb                         ← scaffold writes, this plan extends
  spec/entities/company_spec.rb                                ← scaffold writes, extend with PII tests
  spec/entities/merchant_profile_spec.rb                       ← new
  spec/requests/company_merchant_spec.rb                       ← scaffold writes, extend with 2 routes + audit
  spec/services/hb1_client/companies_spec.rb                   ← scaffold writes, extend
  client-helm/src/lib/companies.ts                             ← scaffold writes, extend types + methods
  client-helm/src/pages/CompanyMerchant/                       ← scaffold writes index/show
    IndexPage.tsx                                              ← scaffold (no edits needed)
    ShowPage.tsx                                               ← extend to composite (company + merchant)
    ChangeTierDrawer.tsx                                       ← new
    {IndexPage,ShowPage,ChangeTierDrawer}.test.tsx
  client-helm/src/App.tsx                                      ← add /companies route + nav
  config/permissions.yml                                       ← scaffold appends account.view_company,
                                                                 plan extends with view_merchant_profile +
                                                                 update_subscription_tier role assignments
  docs/handoff/
    company_merchant.md                                        ← scaffold writes; this plan extends with deltas
    hb1-workflow2-company-merchant.md                          ← new (mirror Workflow 1 HB1 handoff)
```

**Contract between HB1 and Helm:**

```
GET /api/rpa_api/v1/companies/:id
  → { id, name, tier, owner_user_id, created_at, stripe_customer_id?, ... }
       (stripe_customer_id is PII)

GET /api/rpa_api/v1/companies?q=<query>
  → [{ id, name, tier }, ...]   # ≤ 25 results

GET /api/rpa_api/v1/companies/:id/merchant_profile
  → {
      "tier": "professional",
      "billing_state": "active",
      "subscription_started_at": "2025-01-01T00:00:00Z",
      "subscription_renews_at": "2026-07-01T00:00:00Z",
      "payment_method": { "last4": "4242", "brand": "visa" },     # PII
      "check_entity_id": 17,
      "recent_invoices": [
        { "id": 1, "amount_cents": 1999, "status": "paid", "paid_at": "..." }
      ]
    }

POST /api/rpa_api/v1/companies/:id/billing_tier
  body: { to_tier: "professional" }
  → { "from_tier": "starter", "to_tier": "professional", "effective_at": "..." }
```

All requests carry `Authorization: Bearer <RPA_API_TOKEN>`.

---

## Section A — HB1 changes (skipped from execution by default — captured as handoff doc)

> If you're skipping Section A like Workflow 1: write Task A0 (the handoff doc) and stop. The Helm side ships with WebMock stubs. The live demo blocks until HB1 ships.
>
> If you're running Section A inline: each task starts with `cd ~/Homebase1`. The structure mirrors Workflow 1's Section A — orientation grep, extract two service objects, add two Grape routes, verify the GET payload. Pattern reference: `~/helm/helm/docs/handoff/hb1-workflow1-user-lookup.md`.

### Task A0: Write the HB1 handoff doc

**Files:**
- Create: `docs/handoff/hb1-workflow2-company-merchant.md`

- [ ] **Step 1: Create the doc**

Create `docs/handoff/hb1-workflow2-company-merchant.md`:

```markdown
# HB1 changes required for Helm Workflow 2 (Company / Merchant Profile)

**Status:** Pending. Helm has been built against WebMock stubs of these endpoints.
**Owner:** HB1 / Billing pack team

## TL;DR

Add three new endpoints to `app/api/rpa_api/v1/companies_api.rb`:

1. `GET /api/rpa_api/v1/companies/:id/merchant_profile` — extracts the existing `MerchantProfilePresenter` composition into `Billing::MerchantProfileService`. This kills the "presenter invoked twice per page load" perf bug from the Path-Forward doc (16% of admin traffic).
2. `POST /api/rpa_api/v1/companies/:id/billing_tier` — extracts the tier-change logic from `app/admin/biller/*` into `Billing::TierChangeService`.
3. Verify `GET /api/rpa_api/v1/companies/:id` exposes `stripe_customer_id` (PII, fine to always return — Helm gates it server-side).

## Tasks

### 1. Orient

```bash
cd ~/Homebase1
grep -nr "MerchantProfilePresenter"        app/presenters/
grep -nr "class .*TierChange\|tier_change" app/admin/biller/
grep -rn "current_token_actor"             app/api/rpa_api/v1/ | head
```

### 2. Extract `Billing::MerchantProfileService`

Create `app/services/billing/merchant_profile_service.rb`. Move the composition logic from `app/presenters/merchant_profile_presenter.rb` into a service that takes a `Company` and returns a `Struct` with `tier`, `billing_state`, `subscription_started_at`, `subscription_renews_at`, `payment_method`, `check_entity_id`, `recent_invoices`.

Spec at `spec/services/billing/merchant_profile_service_spec.rb`.

### 3. Extract `Billing::TierChangeService`

Create `app/services/billing/tier_change_service.rb`. Move the tier-change logic from `app/admin/biller/*`. Signature: `call(company:, to_tier:, actor:)` returning `Struct(:from_tier, :to_tier, :effective_at)`. Atomic: capture `from_tier` before any mutation, persist, return both values.

Spec at `spec/services/billing/tier_change_service_spec.rb`. Test the atomic capture.

### 4. Add the Grape routes

In `app/api/rpa_api/v1/companies_api.rb`, inside the existing `route_param :id` block:

\`\`\`ruby
desc "Composite merchant profile"
get :merchant_profile do
  company = Company.find(params[:id])
  result  = Billing::MerchantProfileService.call(company: company)
  present(result, with: Entities::MerchantProfile)
end

desc "Change subscription tier"
params do
  requires :to_tier, type: String
end
post :billing_tier do
  company = Company.find(params[:id])
  result  = Billing::TierChangeService.call(
    company: company, to_tier: params[:to_tier], actor: current_token_actor
  )
  present(result, with: Entities::BillingTierChange)
end
\`\`\`

Create the two entities under `app/api/rpa_api/v1/entities/`.

### 5. Replace admin action bodies

In `app/admin/biller/*`, the existing tier-change actions should call `Billing::TierChangeService.call(...)`. The presenter file gets a thin wrapper that delegates to `Billing::MerchantProfileService.call(...)` so ActiveAdmin keeps working.

### 6. Smoke

\`\`\`bash
bin/rails server -p 3000 &
sleep 3
curl -s -H "Authorization: Bearer $RPA_API_TOKEN" http://localhost:3000/api/rpa_api/v1/companies/1/merchant_profile | jq
curl -s -X POST -H "Authorization: Bearer $RPA_API_TOKEN" \
     -H "Content-Type: application/json" \
     -d '{"to_tier":"professional"}' \
     http://localhost:3000/api/rpa_api/v1/companies/1/billing_tier | jq
\`\`\`

## Reference

Full plan: `~/helm/helm/docs/superpowers/plans/2026-06-09-helm-workflow2-company-merchant.md` Section A.
Worked Workflow 1 example: `~/helm/helm/docs/handoff/hb1-workflow1-user-lookup.md`.
```

- [ ] **Step 2: Commit**

```bash
cd ~/helm/helm
git add docs/handoff/hb1-workflow2-company-merchant.md
git commit -m "docs(handoff): HB1 changes required for Workflow 2 (Company / Merchant Profile)"
```

---

## Section B — Run the scaffold + extend BFF

> All Section B tasks run in `~/helm/helm`. The first task IS the scaffold invocation; the rest extend its output.

### Task B1: Run the scaffold

**Files:**
- Created by the scaffold: 12 files listed below
- Modified by the scaffold: `config/permissions.yml`
- Created by the scaffold (HB1 templates): `tmp/hb1-out/company_merchant/`

- [ ] **Step 1: Confirm we're on `helm-scaffold-v1` or later**

```bash
cd ~/helm/helm
git log --oneline helm-scaffold-v1..HEAD 2>&1 | head -3 || echo "On or before helm-scaffold-v1 — proceeding."
```

- [ ] **Step 2: Run the scaffold**

```bash
scripts/scaffold-workflow.rb company_merchant company
```

Expected output: a list of generated files plus a "Next steps" section. The script appends `account.view_company` to `config/permissions.yml` (idempotent).

- [ ] **Step 3: Verify the generated files exist**

```bash
ls app/api/entities/company.rb \
   app/api/helm_api/v1/company_merchant_api.rb \
   app/services/hb1_client/companies.rb \
   spec/entities/company_spec.rb \
   spec/requests/company_merchant_spec.rb \
   spec/services/hb1_client/companies_spec.rb \
   client-helm/src/lib/companies.ts \
   client-helm/src/pages/CompanyMerchant/IndexPage.tsx \
   client-helm/src/pages/CompanyMerchant/ShowPage.tsx \
   docs/handoff/company_merchant.md
```

Expected: every file resolves.

- [ ] **Step 4: Run the generated specs to confirm baseline passes**

```bash
bundle exec rspec spec/entities/company_spec.rb \
                  spec/requests/company_merchant_spec.rb \
                  spec/services/hb1_client/companies_spec.rb
```

Expected: all pass. The scaffold's request spec covers show + search.

- [ ] **Step 5: Commit the scaffold output as-is**

```bash
git add app/api/entities/company.rb \
        app/api/helm_api/v1/company_merchant_api.rb \
        app/services/hb1_client/companies.rb \
        spec/entities/company_spec.rb \
        spec/requests/company_merchant_spec.rb \
        spec/services/hb1_client/companies_spec.rb \
        client-helm/src/lib/companies.ts \
        client-helm/src/pages/CompanyMerchant/ \
        docs/handoff/company_merchant.md \
        config/permissions.yml \
        tmp/hb1-out/company_merchant/
git commit -m "feat(helm): scaffold workflow 2 (company_merchant/company)"
```

### Task B2: Add `Hb1Client::Companies.merchant_profile` and `.change_billing_tier`

**Files:**
- Modify: `app/services/hb1_client/companies.rb`
- Modify: `spec/services/hb1_client/companies_spec.rb`

- [ ] **Step 1: Add failing specs for the two new methods**

Append to `spec/services/hb1_client/companies_spec.rb`:

```ruby
  describe ".merchant_profile" do
    it "GETs the composite merchant profile" do
      stub_request(:get, "https://hb1.test/api/rpa_api/v1/companies/42/merchant_profile")
        .to_return(status: 200,
                   body: { tier: "professional", billing_state: "active" }.to_json,
                   headers: { "Content-Type" => "application/json" })
      expect(described_class.merchant_profile(42))
        .to eq("tier" => "professional", "billing_state" => "active")
    end
  end

  describe ".change_billing_tier" do
    it "POSTs with to_tier in the body" do
      stub_request(:post, "https://hb1.test/api/rpa_api/v1/companies/42/billing_tier")
        .with(body: { to_tier: "professional" }.to_json)
        .to_return(status: 201,
                   body: { from_tier: "starter", to_tier: "professional", effective_at: "now" }.to_json,
                   headers: { "Content-Type" => "application/json" })
      expect(described_class.change_billing_tier(42, to_tier: "professional"))
        .to eq("from_tier" => "starter", "to_tier" => "professional", "effective_at" => "now")
    end
  end
```

- [ ] **Step 2: Run — should fail**

```bash
bundle exec rspec spec/services/hb1_client/companies_spec.rb
```

Expected: 2 new failures (`undefined method 'merchant_profile'` / `'change_billing_tier'`).

- [ ] **Step 3: Add the two methods**

In `app/services/hb1_client/companies.rb`, before the closing `end` of `class Companies`, add:

```ruby
    def self.merchant_profile(id)
      Base.get("/api/rpa_api/v1/companies/#{id}/merchant_profile")
    end

    def self.change_billing_tier(id, to_tier:)
      Base.post("/api/rpa_api/v1/companies/#{id}/billing_tier", body: { to_tier: to_tier })
    end
```

- [ ] **Step 4: Run — should pass**

```bash
bundle exec rspec spec/services/hb1_client/companies_spec.rb
```

Expected: 4 examples (the 2 from the scaffold + 2 new), 0 failures.

- [ ] **Step 5: Commit**

```bash
git add app/services/hb1_client/companies.rb spec/services/hb1_client/companies_spec.rb
git commit -m "feat(helm): Hb1Client::Companies.merchant_profile + change_billing_tier"
```

### Task B3: `Entities::MerchantProfile` and `Entities::BillingTierChange`

**Files:**
- Create: `app/api/entities/merchant_profile.rb`
- Create: `app/api/entities/billing_tier_change.rb`
- Create: `spec/entities/merchant_profile_spec.rb`
- Create: `spec/entities/billing_tier_change_spec.rb`

- [ ] **Step 1: Write failing specs**

Create `spec/entities/merchant_profile_spec.rb`:

```ruby
require "rails_helper"

RSpec.describe Entities::MerchantProfile do
  let(:source) do
    {
      "tier" => "professional",
      "billing_state" => "active",
      "subscription_started_at" => "2025-01-01T00:00:00Z",
      "subscription_renews_at"  => "2026-07-01T00:00:00Z",
      "payment_method" => { "last4" => "4242", "brand" => "visa" },
      "check_entity_id" => 17,
      "recent_invoices" => [
        { "id" => 1, "amount_cents" => 1999, "status" => "paid", "paid_at" => "2026-05-01T00:00:00Z" }
      ]
    }
  end

  def principal(role) = PermissionService::Principal.new(id: 1, role: role, stytch_subject: nil)

  it "exposes non-PII fields for cs_t1_agent" do
    json = described_class.represent(source, role: principal("cs_t1_agent")).serializable_hash
    expect(json[:tier]).to            eq("professional")
    expect(json[:billing_state]).to   eq("active")
    expect(json[:check_entity_id]).to eq(17)
    expect(json[:recent_invoices].first[:status]).to eq("paid")
  end

  it "redacts payment_method when role lacks account.view_pii" do
    json = described_class.represent(source, role: principal("cs_t1_agent")).serializable_hash
    expect(json).not_to have_key(:payment_method)
    expect(json[:_redacted]).to include("payment_method")
  end

  it "exposes payment_method for cs_t2_payments" do
    json = described_class.represent(source, role: principal("cs_t2_payments")).serializable_hash
    expect(json[:payment_method]).to eq(last4: "4242", brand: "visa")
    expect(json[:_redacted]).to eq([])
  end
end
```

Create `spec/entities/billing_tier_change_spec.rb`:

```ruby
require "rails_helper"

RSpec.describe Entities::BillingTierChange do
  it "exposes from_tier, to_tier, effective_at" do
    json = described_class.represent(
      { "from_tier" => "starter", "to_tier" => "professional", "effective_at" => "2026-06-09T17:00:00Z" }
    ).serializable_hash
    expect(json).to eq(from_tier: "starter", to_tier: "professional", effective_at: "2026-06-09T17:00:00Z")
  end
end
```

- [ ] **Step 2: Run — should fail**

```bash
bundle exec rspec spec/entities/merchant_profile_spec.rb spec/entities/billing_tier_change_spec.rb
```

Expected: `uninitialized constant`.

- [ ] **Step 3: Implement the entities**

Create `app/api/entities/merchant_profile.rb`:

```ruby
module Entities
  class MerchantProfile < Grape::Entity
    PII_FIELDS = %w[payment_method].freeze

    expose(:tier)                     { |obj| obj["tier"]                    || obj[:tier] }
    expose(:billing_state)            { |obj| obj["billing_state"]           || obj[:billing_state] }
    expose(:subscription_started_at)  { |obj| obj["subscription_started_at"] || obj[:subscription_started_at] }
    expose(:subscription_renews_at)   { |obj| obj["subscription_renews_at"]  || obj[:subscription_renews_at] }
    expose(:check_entity_id)          { |obj| obj["check_entity_id"]         || obj[:check_entity_id] }
    expose(:recent_invoices) do |obj|
      (obj["recent_invoices"] || obj[:recent_invoices] || []).map do |inv|
        {
          id:           inv["id"]           || inv[:id],
          amount_cents: inv["amount_cents"] || inv[:amount_cents],
          status:       inv["status"]       || inv[:status],
          paid_at:      inv["paid_at"]      || inv[:paid_at]
        }
      end
    end

    with_options(if: ->(_obj, opts) { opts[:role]&.can?("account.view_pii") }) do
      expose(:payment_method) do |obj|
        raw = obj["payment_method"] || obj[:payment_method]
        next nil if raw.nil?
        { last4: raw["last4"] || raw[:last4], brand: raw["brand"] || raw[:brand] }
      end
    end

    expose :_redacted do |_obj, opts|
      opts[:role]&.can?("account.view_pii") ? [] : PII_FIELDS
    end
  end
end
```

Create `app/api/entities/billing_tier_change.rb`:

```ruby
module Entities
  class BillingTierChange < Grape::Entity
    expose(:from_tier)    { |obj| obj["from_tier"]    || obj[:from_tier] }
    expose(:to_tier)      { |obj| obj["to_tier"]      || obj[:to_tier] }
    expose(:effective_at) { |obj| obj["effective_at"] || obj[:effective_at] }
  end
end
```

- [ ] **Step 4: Run — should pass**

```bash
bundle exec rspec spec/entities/merchant_profile_spec.rb spec/entities/billing_tier_change_spec.rb
```

Expected: 4 examples, 0 failures.

- [ ] **Step 5: Commit**

```bash
git add app/api/entities/merchant_profile.rb app/api/entities/billing_tier_change.rb \
        spec/entities/merchant_profile_spec.rb spec/entities/billing_tier_change_spec.rb
git commit -m "feat(helm): MerchantProfile + BillingTierChange entities (payment_method PII-gated)"
```

### Task B4: Extend `Entities::Company` with `stripe_customer_id` PII

**Files:**
- Modify: `app/api/entities/company.rb`
- Modify: `spec/entities/company_spec.rb`

- [ ] **Step 1: Add failing PII specs to the scaffold's spec**

Replace the body of `spec/entities/company_spec.rb` with:

```ruby
require "rails_helper"

RSpec.describe Entities::Company do
  let(:source) do
    {
      "id" => 1, "name" => "Acme", "created_at" => "2026-06-09T00:00:00Z",
      "tier" => "professional", "owner_user_id" => 99,
      "stripe_customer_id" => "cus_abc"
    }
  end

  def principal(role) = PermissionService::Principal.new(id: 1, role: role, stytch_subject: nil)

  it "exposes the basic fields" do
    json = described_class.represent(source, role: principal("cs_t1_agent")).serializable_hash
    expect(json).to include(id: 1, name: "Acme", tier: "professional", owner_user_id: 99)
  end

  it "redacts stripe_customer_id for cs_t1_agent" do
    json = described_class.represent(source, role: principal("cs_t1_agent")).serializable_hash
    expect(json).not_to have_key(:stripe_customer_id)
    expect(json[:_redacted]).to include("stripe_customer_id")
  end

  it "exposes stripe_customer_id for cs_t2_payments" do
    json = described_class.represent(source, role: principal("cs_t2_payments")).serializable_hash
    expect(json[:stripe_customer_id]).to eq("cus_abc")
    expect(json[:_redacted]).to eq([])
  end
end
```

- [ ] **Step 2: Run — should fail**

```bash
bundle exec rspec spec/entities/company_spec.rb
```

Expected: 3 failures (the spec covers more than the scaffold's entity exposes).

- [ ] **Step 3: Extend the scaffold's `company.rb`**

Replace `app/api/entities/company.rb` with:

```ruby
module Entities
  class Company < Grape::Entity
    PII_FIELDS = %w[stripe_customer_id].freeze

    expose(:id)            { |obj| obj["id"]            || obj[:id] }
    expose(:name)          { |obj| obj["name"]          || obj[:name] }
    expose(:tier)          { |obj| obj["tier"]          || obj[:tier] }
    expose(:owner_user_id) { |obj| obj["owner_user_id"] || obj[:owner_user_id] }
    expose(:created_at)    { |obj| obj["created_at"]    || obj[:created_at] }

    with_options(if: ->(_obj, opts) { opts[:role]&.can?("account.view_pii") }) do
      expose(:stripe_customer_id) { |obj| obj["stripe_customer_id"] || obj[:stripe_customer_id] }
    end

    expose :_redacted do |_obj, opts|
      opts[:role]&.can?("account.view_pii") ? [] : PII_FIELDS
    end
  end
end
```

- [ ] **Step 4: Run — should pass**

```bash
bundle exec rspec spec/entities/company_spec.rb
```

Expected: 3 examples, 0 failures.

- [ ] **Step 5: Commit**

```bash
git add app/api/entities/company.rb spec/entities/company_spec.rb
git commit -m "feat(helm): Entities::Company exposes tier + owner_user_id + PII-gated stripe_customer_id"
```

### Task B5: Add per-workflow permission keys to YAML

**Files:**
- Modify: `config/permissions.yml`

- [ ] **Step 1: Verify the scaffold already added `account.view_company`**

```bash
grep "account.view_company" config/permissions.yml
```

Expected: one match in the `permissions:` block.

- [ ] **Step 2: Add the two new keys**

In `config/permissions.yml`, add to the `permissions:` block:

```yaml
  - { key: account.view_merchant_profile,    scope: company }
  - { key: billing.update_subscription_tier, scope: company }
```

Then assign `account.view_company` and `account.view_merchant_profile` to every CS / eng role (they all already have these per Plan 1's seed YAML; just confirm). Assign `billing.update_subscription_tier` to:

```yaml
  cs_t2_payments:
    permissions:
      - ...
      - billing.update_subscription_tier   # already there from Plan 1

  eng_super:
    permissions:
      - ...
      - billing.update_subscription_tier   # already there
```

If your YAML matches Plan 1's seed (`config/permissions.yml` from `helm-foundation-v1`), `cs_t2_payments` and `eng_super` already hold this — and `eng_power` covers it via the `billing.*` wildcard. No assignment changes needed; just confirm.

- [ ] **Step 3: Boot Rails and confirm the new keys validate**

```bash
bin/rails runner 'pp PermissionService.backend.permissions_for(PermissionService::Principal.new(id:1, role:"cs_t2_payments", stytch_subject:nil))' 2>&1 | tail -5
```

Expected: array containing `billing.update_subscription_tier`. If Rails fails to boot with `InvalidPermissionsFile`, you mistyped a key.

- [ ] **Step 4: Commit**

```bash
git add config/permissions.yml
git commit -m "feat(helm): add account.view_merchant_profile + confirm tier-change role assignments"
```

### Task B6: Extend `CompanyMerchantApi` with `get :merchant_profile` and `post :billing_tier`

**Files:**
- Modify: `app/api/helm_api/v1/company_merchant_api.rb`
- Modify: `spec/requests/company_merchant_spec.rb`

- [ ] **Step 1: Write the failing request specs**

Append to `spec/requests/company_merchant_spec.rb`:

```ruby
  describe "GET /helm_api/v1/companies/:id/merchant_profile" do
    let(:hb1_profile) do
      {
        "tier" => "professional", "billing_state" => "active",
        "subscription_started_at" => "2025-01-01T00:00:00Z",
        "subscription_renews_at"  => "2026-07-01T00:00:00Z",
        "payment_method" => { "last4" => "4242", "brand" => "visa" },
        "check_entity_id" => 17, "recent_invoices" => []
      }
    end

    before do
      stub_request(:get, "https://hb1.test/api/rpa_api/v1/companies/42/merchant_profile")
        .to_return(status: 200, body: hb1_profile.to_json,
                   headers: { "Content-Type" => "application/json" })
    end

    it "redacts payment_method for cs_t1_agent" do
      get "#{base}/42/merchant_profile", headers: { "Cookie" => "HELM_DEMO_ROLE=cs_t1_agent" }
      body = JSON.parse(response.body)
      expect(response).to have_http_status(200)
      expect(body).not_to have_key("payment_method")
    end

    it "exposes payment_method for cs_t2_payments" do
      AdminUser.find_or_create_by!(email: "cs_t2_payments@helm.local") do |u|
        u.full_name = "CS T2 Payments"; u.role = "cs_t2_payments"
      end
      get "#{base}/42/merchant_profile", headers: { "Cookie" => "HELM_DEMO_ROLE=cs_t2_payments" }
      body = JSON.parse(response.body)
      expect(body["payment_method"]).to eq("last4" => "4242", "brand" => "visa")
    end
  end

  describe "POST /helm_api/v1/companies/:id/billing_tier" do
    let(:hb1_change) { { "from_tier" => "starter", "to_tier" => "professional", "effective_at" => "2026-06-09T17:00:00Z" } }

    before do
      AdminUser.find_or_create_by!(email: "cs_t2_payments@helm.local") do |u|
        u.full_name = "CS T2 Payments"; u.role = "cs_t2_payments"
      end
    end

    it "403s for cs_t1_agent (lacks billing.update_subscription_tier)" do
      post "#{base}/42/billing_tier",
           params: { to_tier: "professional" },
           headers: { "Cookie" => "HELM_DEMO_ROLE=cs_t1_agent" }
      expect(response).to have_http_status(403)
    end

    it "200s for cs_t2_payments and writes one audit event with payload_before + payload_after" do
      stub_request(:get, "https://hb1.test/api/rpa_api/v1/companies/42")
        .to_return(status: 200, body: { id: 42, name: "Acme", tier: "starter" }.to_json,
                   headers: { "Content-Type" => "application/json" })
      stub_request(:post, "https://hb1.test/api/rpa_api/v1/companies/42/billing_tier")
        .with(body: { to_tier: "professional" }.to_json)
        .to_return(status: 201, body: hb1_change.to_json,
                   headers: { "Content-Type" => "application/json" })

      expect {
        post "#{base}/42/billing_tier",
             params: { to_tier: "professional" },
             headers: { "Cookie" => "HELM_DEMO_ROLE=cs_t2_payments" }
      }.to change(AuditEvent, :count).by(1)

      expect(response).to have_http_status(:ok).or have_http_status(:created)
      event = AuditEvent.last
      expect(event.action).to        eq("company.billing_tier_changed")
      expect(event.payload_before).to eq("tier" => "starter")
      expect(event.payload_after).to  eq("tier" => "professional")
    end
  end
```

- [ ] **Step 2: Run — should fail (no routes)**

```bash
bundle exec rspec spec/requests/company_merchant_spec.rb
```

Expected: 404s on the new routes.

- [ ] **Step 3: Extend the API**

Replace `app/api/helm_api/v1/company_merchant_api.rb` with:

```ruby
module HelmApi
  module V1
    class CompanyMerchantApi < Grape::API
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

      resource :companies do
        params do
          optional :q, type: String
        end
        get do
          check_permission!("account.view_company", scope: {})
          Hb1Client::Companies.search(params[:q].to_s)
        end

        route_param :id, type: Integer do
          get do
            check_permission!("account.view_company", scope: { company_id: params[:id] })
            company = Hb1Client::Companies.show(params[:id])
            present company, with: Entities::Company, role: current_principal
          end

          get :merchant_profile do
            check_permission!("account.view_merchant_profile", scope: { company_id: params[:id] })
            profile = Hb1Client::Companies.merchant_profile(params[:id])
            present profile, with: Entities::MerchantProfile, role: current_principal
          end

          params do
            requires :to_tier, type: String
          end
          post :billing_tier do
            check_permission!("billing.update_subscription_tier", scope: { company_id: params[:id] })

            company   = Hb1Client::Companies.show(params[:id])
            from_tier = company["tier"]

            result = Hb1Client::Companies.change_billing_tier(params[:id], to_tier: params[:to_tier])

            AuditService.record(
              actor:          lookup_admin_user!,
              workflow:       "company_merchant",
              action:         "company.billing_tier_changed",
              resource_type:  "Company",
              resource_id:    params[:id],
              payload_before: { tier: from_tier },
              payload_after:  { tier: result["to_tier"] }
            )

            present result, with: Entities::BillingTierChange
          end
        end
      end
    end
  end
end
```

- [ ] **Step 4: Mount the API in `base.rb`**

In `app/api/helm_api/v1/base.rb`, add alongside the existing mounts:

```ruby
      mount HelmApi::V1::CompanyMerchantApi
```

- [ ] **Step 5: Run the request spec**

```bash
bundle exec rspec spec/requests/company_merchant_spec.rb
```

Expected: 6 examples (the scaffold's 2 + the 4 added here), 0 failures.

- [ ] **Step 6: Run the full backend suite**

```bash
bundle exec rspec
```

Expected: all green.

- [ ] **Step 7: Commit**

```bash
git add app/api/helm_api/v1/company_merchant_api.rb \
        app/api/helm_api/v1/base.rb \
        spec/requests/company_merchant_spec.rb
git commit -m "feat(helm): CompanyMerchantApi.merchant_profile + billing_tier with before/after audit"
```

---

## Section C — Helm React: composite show page + tier-change drawer

> All Section C tasks run in `~/helm/helm`. Frontend commands run from `client-helm/`.

### Task C1: Extend `lib/companies.ts` with the new types and methods

**Files:**
- Modify: `client-helm/src/lib/companies.ts`

- [ ] **Step 1: Replace the scaffold's `companies.ts`**

Replace `client-helm/src/lib/companies.ts` with:

```ts
import { api } from "./api";

export type CompanySummary = { id: number; name: string; tier: string };

export type CompanyDetail = {
  id: number;
  name: string;
  tier: string;
  owner_user_id: number;
  created_at: string;
  stripe_customer_id?: string;
  _redacted: string[];
};

export type MerchantProfile = {
  tier: string;
  billing_state: string;
  subscription_started_at: string;
  subscription_renews_at: string;
  check_entity_id: number | null;
  payment_method?: { last4: string; brand: string };
  recent_invoices: Array<{ id: number; amount_cents: number; status: string; paid_at: string }>;
  _redacted: string[];
};

export type BillingTierChange = { from_tier: string; to_tier: string; effective_at: string };

export const companiesApi = {
  search:           (q: string) => api.get<CompanySummary[]>(`/helm_api/v1/companies?q=${encodeURIComponent(q)}`),
  show:             (id: number | string) => api.get<CompanyDetail>(`/helm_api/v1/companies/${id}`),
  merchantProfile:  (id: number | string) => api.get<MerchantProfile>(`/helm_api/v1/companies/${id}/merchant_profile`),
  changeTier:       (id: number | string, to_tier: string) =>
    api.post<BillingTierChange>(`/helm_api/v1/companies/${id}/billing_tier`, { to_tier }),
};
```

- [ ] **Step 2: Type-check**

```bash
cd client-helm && bun run build 2>&1 | tail -10
```

Expected: build exits 0. (Pages that use the old `companiesApi.search/show` still work because we kept those.)

- [ ] **Step 3: Commit**

```bash
cd ~/helm/helm
git add client-helm/src/lib/companies.ts
git commit -m "feat(helm-client): companies.ts adds MerchantProfile + BillingTierChange types"
```

### Task C2: `ChangeTierDrawer` component

**Files:**
- Create: `client-helm/src/pages/CompanyMerchant/ChangeTierDrawer.tsx`
- Create: `client-helm/src/pages/CompanyMerchant/ChangeTierDrawer.test.tsx`

- [ ] **Step 1: Write the failing drawer spec**

Create `client-helm/src/pages/CompanyMerchant/ChangeTierDrawer.test.tsx`:

```tsx
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ChangeTierDrawer } from "./ChangeTierDrawer";

function wrap(ui: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{ui}</QueryClientProvider>;
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});

describe("ChangeTierDrawer", () => {
  it("submits the chosen tier and reports success", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ from_tier: "starter", to_tier: "professional", effective_at: "now" }),
    } as Response);

    const onSuccess = vi.fn();
    render(wrap(<ChangeTierDrawer open companyId={42} currentTier="starter" onClose={() => {}} onSuccess={onSuccess} />));

    fireEvent.mouseDown(screen.getByRole("combobox"));
    fireEvent.click(screen.getByRole("option", { name: "professional" }));
    fireEvent.click(screen.getByRole("button", { name: /apply/i }));

    await waitFor(() => expect(onSuccess).toHaveBeenCalledWith(
      expect.objectContaining({ from_tier: "starter", to_tier: "professional" })
    ));
  });

  it("does nothing when cancel is clicked", () => {
    const onClose = vi.fn();
    render(wrap(<ChangeTierDrawer open companyId={42} currentTier="starter" onClose={onClose} onSuccess={() => {}} />));
    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));
    expect(onClose).toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Implement the drawer**

Create `client-helm/src/pages/CompanyMerchant/ChangeTierDrawer.tsx`:

```tsx
import { useState } from "react";
import {
  Drawer, Box, Typography, FormControl, InputLabel, Select, MenuItem,
  Stack, Button, Alert
} from "@mui/material";
import { useMutation } from "@tanstack/react-query";
import { companiesApi, BillingTierChange } from "../../lib/companies";

const TIERS = ["starter", "professional", "enterprise"] as const;

type Props = {
  open: boolean;
  onClose: () => void;
  companyId: number;
  currentTier: string;
  onSuccess: (change: BillingTierChange) => void;
};

export function ChangeTierDrawer({ open, onClose, companyId, currentTier, onSuccess }: Props) {
  const [toTier, setToTier] = useState<string>(currentTier);

  const mutation = useMutation({
    mutationFn: () => companiesApi.changeTier(companyId, toTier),
    onSuccess,
  });

  return (
    <Drawer anchor="right" open={open} onClose={onClose}>
      <Box sx={{ width: 360, p: 3 }}>
        <Typography variant="h6" gutterBottom>Change subscription tier</Typography>
        <Typography color="text.secondary" gutterBottom>Company #{companyId}</Typography>

        <Alert severity="info" sx={{ my: 2 }}>
          Current tier: <strong>{currentTier}</strong>
        </Alert>

        <FormControl fullWidth>
          <InputLabel>New tier</InputLabel>
          <Select value={toTier} label="New tier" onChange={(e) => setToTier(e.target.value as string)}>
            {TIERS.map((t) => <MenuItem key={t} value={t}>{t}</MenuItem>)}
          </Select>
        </FormControl>

        {mutation.isError && (
          <Alert severity="error" sx={{ mt: 2 }}>{(mutation.error as Error).message}</Alert>
        )}

        <Stack direction="row" spacing={1} justifyContent="flex-end" sx={{ mt: 3 }}>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="contained"
            disabled={mutation.isPending || toTier === currentTier}
            onClick={() => mutation.mutate()}
          >
            Apply
          </Button>
        </Stack>
      </Box>
    </Drawer>
  );
}
```

- [ ] **Step 3: Run the spec**

```bash
cd client-helm && bun run test src/pages/CompanyMerchant/ChangeTierDrawer.test.tsx
```

Expected: 2 tests pass.

- [ ] **Step 4: Don't commit yet — wait for C3 so ShowPage imports resolve**

### Task C3: Rewrite the scaffold's `ShowPage` to a composite (company + merchant) view

**Files:**
- Modify: `client-helm/src/pages/CompanyMerchant/ShowPage.tsx`
- Modify: `client-helm/src/pages/CompanyMerchant/ShowPage.test.tsx`

- [ ] **Step 1: Replace the spec with one that exercises the composite view + tier change button**

Replace `client-helm/src/pages/CompanyMerchant/ShowPage.test.tsx` with:

```tsx
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { PermissionContext } from "../../lib/permissions";
import { CompanyMerchantShowPage } from "./ShowPage";

function wrap(ui: React.ReactNode, role: string, permissions: string[]) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={client}>
      <PermissionContext.Provider value={{ role, permissions, available_roles: [] }}>
        <MemoryRouter initialEntries={["/companies/42"]}>
          <Routes>
            <Route path="/companies/:id" element={ui} />
          </Routes>
        </MemoryRouter>
      </PermissionContext.Provider>
    </QueryClientProvider>
  );
}

const detail = {
  id: 42, name: "Acme", tier: "starter", owner_user_id: 99,
  created_at: "2026-06-09T00:00:00Z", _redacted: ["stripe_customer_id"]
};

const profile = {
  tier: "starter", billing_state: "active",
  subscription_started_at: "2025-01-01T00:00:00Z",
  subscription_renews_at:  "2026-07-01T00:00:00Z",
  check_entity_id: 17, recent_invoices: [],
  _redacted: ["payment_method"]
};

function mockBoth(detailBody: object, profileBody: object) {
  (fetch as ReturnType<typeof vi.fn>).mockImplementation((url: string) => {
    if (url.endsWith("/merchant_profile")) {
      return Promise.resolve({ ok: true, json: async () => profileBody } as Response);
    }
    return Promise.resolve({ ok: true, json: async () => detailBody } as Response);
  });
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});

describe("CompanyMerchantShowPage", () => {
  it("renders company name, tier, and merchant profile in one view", async () => {
    mockBoth(detail, profile);
    render(wrap(<CompanyMerchantShowPage />, "cs_t1_agent",
      ["account.view_company", "account.view_merchant_profile"]));

    await waitFor(() => expect(screen.getByText("Acme")).toBeInTheDocument());
    expect(screen.getByText(/starter/i)).toBeInTheDocument();
    expect(screen.getByText(/active/i)).toBeInTheDocument();
  });

  it("hides Change tier button for cs_t1_agent", async () => {
    mockBoth(detail, profile);
    render(wrap(<CompanyMerchantShowPage />, "cs_t1_agent",
      ["account.view_company", "account.view_merchant_profile"]));

    await waitFor(() => expect(screen.getByText("Acme")).toBeInTheDocument());
    expect(screen.queryByRole("button", { name: /change tier/i })).not.toBeInTheDocument();
  });

  it("shows Change tier button for cs_t2_payments", async () => {
    mockBoth(detail, profile);
    render(wrap(<CompanyMerchantShowPage />, "cs_t2_payments",
      ["account.view_company", "account.view_merchant_profile", "billing.update_subscription_tier"]));

    await waitFor(() => expect(screen.getByText("Acme")).toBeInTheDocument());
    expect(screen.getByRole("button", { name: /change tier/i })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run — should fail (page doesn't have the composite layout yet)**

```bash
bun run test src/pages/CompanyMerchant/ShowPage.test.tsx
```

Expected: at least 2 failures.

- [ ] **Step 3: Replace the scaffold's `ShowPage.tsx`**

Replace `client-helm/src/pages/CompanyMerchant/ShowPage.tsx` with:

```tsx
import { useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Box, Button, Card, CardContent, CircularProgress, Divider, Snackbar, Stack, Tab, Tabs, Typography
} from "@mui/material";
import { useState } from "react";
import { companiesApi } from "../../lib/companies";
import { usePermission } from "../../lib/permissions";
import { PiiField } from "../../components/PiiField";
import { AuditTrailTab } from "../../components/AuditTrailTab";
import { ChangeTierDrawer } from "./ChangeTierDrawer";

export function CompanyMerchantShowPage() {
  const { id } = useParams<{ id: string }>();
  const companyId = Number(id);
  const qc = useQueryClient();
  const [tab, setTab] = useState<"profile" | "audit">("profile");
  const [snack, setSnack] = useState<string | null>(null);
  const [tierOpen, setTierOpen] = useState(false);

  const { data: company, isLoading: loadingCompany } = useQuery({
    queryKey: ["companies", companyId],
    queryFn: () => companiesApi.show(companyId),
  });

  const { data: merchant, isLoading: loadingMerchant } = useQuery({
    queryKey: ["companies", companyId, "merchant"],
    queryFn: () => companiesApi.merchantProfile(companyId),
  });

  const canChangeTier = usePermission("billing.update_subscription_tier");

  if (loadingCompany || loadingMerchant || !company || !merchant) return <CircularProgress />;

  return (
    <Box>
      <Typography variant="h5">{company.name}</Typography>
      <Typography color="text.secondary">#{company.id} · tier: {company.tier}</Typography>

      <Stack direction="row" spacing={2} mt={2}>
        {canChangeTier && (
          <Button variant="contained" onClick={() => setTierOpen(true)}>Change tier</Button>
        )}
      </Stack>

      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mt: 3 }}>
        <Tab value="profile" label="Company + Merchant Profile" />
        <Tab value="audit"   label="Audit trail" />
      </Tabs>
      <Divider />

      {tab === "profile" && (
        <Stack spacing={2} sx={{ mt: 2 }}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>Company</Typography>
              <Row label="Owner user">{company.owner_user_id}</Row>
              <Row label="Stripe customer">
                <PiiField name="stripe_customer_id" value={company.stripe_customer_id} redactedFields={company._redacted} />
              </Row>
              <Row label="Created at">{company.created_at}</Row>
            </CardContent>
          </Card>

          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>Merchant profile</Typography>
              <Row label="Billing state">{merchant.billing_state}</Row>
              <Row label="Subscription">
                {merchant.subscription_started_at} → renews {merchant.subscription_renews_at}
              </Row>
              <Row label="Check entity id">{merchant.check_entity_id ?? "—"}</Row>
              <Row label="Payment method">
                {merchant._redacted.includes("payment_method")
                  ? <PiiField name="payment_method" value={null} redactedFields={merchant._redacted} />
                  : merchant.payment_method
                    ? <>{merchant.payment_method.brand} ···· {merchant.payment_method.last4}</>
                    : "—"}
              </Row>
              <Row label="Recent invoices">
                {merchant.recent_invoices.length === 0
                  ? "(none)"
                  : merchant.recent_invoices.map((i) => (
                      <Box key={i.id}>#{i.id} — {(i.amount_cents / 100).toFixed(2)} ({i.status})</Box>
                    ))}
              </Row>
            </CardContent>
          </Card>
        </Stack>
      )}

      {tab === "audit" && <AuditTrailTab resourceType="Company" resourceId={companyId} />}

      <ChangeTierDrawer
        open={tierOpen}
        onClose={() => setTierOpen(false)}
        companyId={companyId}
        currentTier={company.tier}
        onSuccess={(change) => {
          setSnack(`Tier changed: ${change.from_tier} → ${change.to_tier}`);
          setTierOpen(false);
          qc.invalidateQueries({ queryKey: ["companies", companyId] });
          qc.invalidateQueries({ queryKey: ["companies", companyId, "merchant"] });
          qc.invalidateQueries({ queryKey: ["audits", "Company", companyId] });
        }}
      />

      <Snackbar open={!!snack} onClose={() => setSnack(null)} message={snack ?? ""} autoHideDuration={4000} />
    </Box>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <Stack direction="row" spacing={2} py={0.5} alignItems="baseline">
      <Typography sx={{ width: 200 }} color="text.secondary">{label}</Typography>
      <Box>{children}</Box>
    </Stack>
  );
}
```

- [ ] **Step 4: Run all CompanyMerchant page specs**

```bash
bun run test src/pages/CompanyMerchant
```

Expected: 3 ShowPage + 2 ChangeTierDrawer + scaffold IndexPage tests pass (≥6 tests across 3 files).

- [ ] **Step 5: Run the full frontend suite**

```bash
bun run test
```

Expected: all green (Plan 1+2 = 16 tests, +3 ShowPage +2 ChangeTier +1 IndexPage from scaffold ≈ 22+ tests).

- [ ] **Step 6: Build**

```bash
bun run build
```

Expected: exits 0.

- [ ] **Step 7: Commit C2+C3 together**

```bash
cd ~/helm/helm
git add client-helm/src/pages/CompanyMerchant/
git commit -m "feat(helm-client): CompanyMerchant composite ShowPage + ChangeTierDrawer"
```

### Task C4: Wire the route + nav link

**Files:**
- Modify: `client-helm/src/App.tsx`

- [ ] **Step 1: Read current App.tsx**

```bash
cat client-helm/src/App.tsx
```

- [ ] **Step 2: Add the Companies route and nav button**

Replace `client-helm/src/App.tsx` with:

```tsx
import { Box, Button, Stack, Typography } from "@mui/material";
import { Route, Routes, Link as RouterLink, Navigate } from "react-router-dom";
import { PermissionProvider, useSession } from "./lib/permissions";
import { RoleSwitcher } from "./components/RoleSwitcher";
import { UserLookupIndexPage } from "./pages/UserLookup/IndexPage";
import { UserLookupShowPage } from "./pages/UserLookup/ShowPage";
import { CompanyMerchantIndexPage } from "./pages/CompanyMerchant/IndexPage";
import { CompanyMerchantShowPage } from "./pages/CompanyMerchant/ShowPage";

function Header() {
  const { role } = useSession();
  return (
    <Stack direction="row" justifyContent="space-between" alignItems="center" p={2} borderBottom="1px solid #eee">
      <Stack direction="row" spacing={3} alignItems="center">
        <Typography variant="h5">Helm</Typography>
        <Button component={RouterLink} to="/users"     size="small">User lookup</Button>
        <Button component={RouterLink} to="/companies" size="small">Company / Merchant</Button>
      </Stack>
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
          <Routes>
            <Route path="/" element={<Navigate to="/users" replace />} />
            <Route path="/users"          element={<UserLookupIndexPage />} />
            <Route path="/users/:id"      element={<UserLookupShowPage />} />
            <Route path="/companies"      element={<CompanyMerchantIndexPage />} />
            <Route path="/companies/:id"  element={<CompanyMerchantShowPage />} />
          </Routes>
        </Box>
      </Box>
    </PermissionProvider>
  );
}
```

Note: the scaffold named its IndexPage `CompanyMerchantIndexPage` (`page_dir = workflow_camel`) but the scaffold's `ShowPage` is exported as `CompanyMerchantShowPage` after Task C3's rewrite.

- [ ] **Step 3: Build**

```bash
cd client-helm && bun run build 2>&1 | tail -10
```

Expected: exits 0.

- [ ] **Step 4: Commit**

```bash
cd ~/helm/helm
git add client-helm/src/App.tsx
git commit -m "feat(helm-client): mount /companies routes + nav button"
```

---

## Task FINAL: Smoke + tag

- [ ] **Step 1: Full backend suite**

```bash
cd ~/helm/helm
bundle exec rspec
```

Expected: all green (Plan 1 + 2 + 3 + 4 specs).

- [ ] **Step 2: Full frontend suite**

```bash
cd ~/helm/helm/client-helm && bun run test
```

Expected: all green.

- [ ] **Step 3: Update README workflow status**

In `README.md`, update the workflow table row for #2:

```markdown
| 2 | Company/Merchant | Built (Helm side). Live demo blocked on HB1 — see [hb1 handoff](docs/handoff/hb1-workflow2-company-merchant.md). |
```

- [ ] **Step 4: Commit + tag**

```bash
cd ~/helm/helm
git add README.md
git commit -m "docs(helm): mark Workflow 2 as built (Helm side)"
git tag helm-workflow2-v1-helm-only
```

---

## Done with Plan 4

- The scaffold did real work: it produced 12 files that compiled and tested before any edits.
- Section B added 3 deltas to the scaffold's output: PII on `Entities::Company`, two new methods on `Hb1Client::Companies` + two new entities + two new BFF routes with before/after audit.
- Section C extended one scaffold file (ShowPage) into a composite view and added one new component (`ChangeTierDrawer`).
- The `payload_before` pattern (capture-before-mutate via a separate `Hb1Client.show` call) is a reusable shape for any audit row that needs to record a diff.
- Total commits since `helm-scaffold-v1`: ~8 (scaffold + 5 BFF + 3 React).

**Forcing-function signal:** any rough edges hit during Plan 4 execution (scaffold-generated names that needed renaming, missing template hooks, etc.) become PRs against the scaffold *before* Plan 5 (Location Management) runs. Plan 5 should run cleaner; if it doesn't, the scaffold has more shape to absorb.

**Next:** Plan 5 builds Workflow 3 (Location Management) with the same scaffold-first pattern. Then the MVP is feature-complete and the handoff toolkit has been used twice by AI in real workflows.
