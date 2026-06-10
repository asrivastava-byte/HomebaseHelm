# Helm MVP — Admin Panel Replacement

**Status:** v1.1 — built and demoable. Original spec approved 2026-06-09; amendments applied 2026-06-10.
**Date:** 2026-06-09 (v1), 2026-06-10 (v1.1 amendments)
**Owner:** Anumita Srivastava
**Product name in UI:** "Homebase Helm"
**Related:**
- [Admin Panel: Path Forward](https://joinhomebase.atlassian.net/wiki/spaces/CE1/pages/5040799765/) — Step 4 (Consolidate Into One Tool)
- [Getting Started with AuthZ](https://joinhomebase.atlassian.net/wiki/spaces/AAAI/pages/5030838307/)
- Project memory: `project_admin_mvp_replacement.md`
- Implementation plans: `docs/superpowers/plans/2026-06-09-helm-*.md` (Plans 1–5)
- Handoff docs: `docs/handoff/{TEMPLATE,user_lookup,hb1-workflow*}.md`

## Changelog

**v1.1 (2026-06-10) — visual-demo expansions.** All driven by APM tables surfaced during demo prep; not in the original APM-verified MVP scope but layered cleanly on top of it. No architectural changes; same scaffold pattern applies.

- **Branding:** Product is named "Homebase Helm" in UI and browser title. Custom MUI theme uses Homebase deep-purple `#1E0E3E` top bar, bright-purple `#5E2BFF` primary, yellow `#FFE94A` info, pill-shaped buttons, rounded cards. RoleSwitcher restyled white-on-purple. (`client-helm/src/theme.ts`)
- **Audit trail UX:** `/helm_api/v1/audits` joins `admin_users` and exposes `admin_user_email` + `admin_user_name`. Frontend renders `Name · email · #id` as the actor label so audit rows credit a person, not just a role.
- **Demo seed:** `bin/demo-data` accepts `HELM_DEMO_PERSON` env (default `Anumita Srivastava`) and updates `AdminUser.full_name` so audit rows show a real human regardless of which role the demo is acting as.
- **User workflow:** added §4.1.1 detail fields (memberships, jobs, MFA status, bank presence), edit user (PATCH with diff audit), resend verification email.
- **Location workflow:** added §4.3.1 detail fields (address, tier, partner, job counts, users[]), unarchive jobs, impersonate user at location.
- **Company / Merchant workflow:** added §4.2.1 detail fields (payroll readiness, missing-data flags, check entity; company subscription/locations/payment attempts), sales-tax view (tiered), biller view (PII-gated credit cards + tier history).
- **New permissions added** (§3.1 updated): `account.edit_user`, `account.resend_verification_email`, `account.view_sales_tax`, `account.view_biller`.
- **New audit actions** (§5.2 updated): `user.edited` (with `payload_before`/`payload_after` diff), `user.verification_email_sent`, `location.jobs_unarchived`, `location.user_impersonated`.
- **Mock HB1 server** for local demo: `tmp/mock-hb1.rb` (WEBrick) serves canned HB1 responses including a `/fake_login/<token>` page so impersonation new-tabs land somewhere real instead of an unresolved hostname. Not production code; documents the contract Helm needs from HB1.
- **Scaffold fix:** generator now emits `app/api/helm_api/v1/<resource_plural>_api.rb` (matching the inner `<ResourcePlural>Api` class) instead of `<workflow_snake>_api.rb` (which broke Zeitwerk). Fixed mid-Plan-4; `helm-scaffold-v1` tag includes the fix.

---

## 1. Overview

Helm is a new admin tool that replaces the existing ActiveAdmin + Reactive Admin panels (`app/admin/*` and the React app inside `client/`). The MVP covers three workflows representing **84% of admin traffic** (verified via Datadog APM, 30 days):

1. **User Account Lookup** (43.8% of traffic)
2. **Company Account & Merchant Profile** (26.5%)
3. **Location Management** (13.8%)

The MVP demonstrates the architectural pattern — service-mediated authorization, YAML-driven permissions, role-keyed PII masking, audited writes, full observability — and ships with a generator + template so each pack team can migrate their own workflows by copying the pattern.

### Goals

- **Demo a working product** with three workflows, role-switching, and live PII redaction
- **AuthZ-shaped** authorization model that can swap from YAML to real AuthZ when admin-rep reconciliation lands
- **YAML-driven, config-only permissions** — a CS Tier 4 leader can edit a YAML file and reload; no code changes
- **Aligned with HB1 stack** — Rails backend, Grape REST APIs, Vite + React + TS frontend (mirrors `~/Homebase1/client`)
- **NO god mode** — impersonation is an explicit, gated, audited permission
- **NO GraphQL** — all data crosses HTTP via Grape REST endpoints in `app/api/rpa_api/v1/*`
- **AI-led, hand off to each pack team** — three worked examples + scaffold generator + template README

### Non-goals (explicit)

- Okta SSO integration (cheated for MVP — see §3.4)
- AuthZ runtime gRPC integration (stubbed; AuthZ-shaped YAML is swap-ready)
- Lattice impersonation integration (Helm uses HB1's existing `login_user` mechanism wrapped in the new permission gate)
- Row-level scoping (resource-type scoping only, matching Path-Forward Step 2.5 "Out of scope")
- Session-exit audit logging (Path-Forward Step 3.1 known gap — flagged for follow-up)
- End-to-end Playwright/Cypress tests (Vitest unit tests only)
- CI/deploy infra (demo runs locally; production deploy is a separate plan)
- GraphQL surface or Apollo Client usage anywhere

---

## 2. Architecture & Topology

### 2.1 Repository layout

```
~/Homebase1                            (existing monolith; minimal additions)
  app/api/rpa_api/v1/
    users_api.rb                       ← extend (new POST routes)
    companies_api.rb                   ← extend (new POST route)
    merchant_profiles_api.rb           ← new (extracts MerchantProfilePresenter)
    locations_api.rb                   ← new
  app/services/
    identity/users/send_verification_sms.rb         ← extract from app/admin/users.rb:677
    identity/users/issue_impersonation_token.rb     ← extract from app/admin/users.rb:565
    billing/tier_change_service.rb                  ← extract from app/admin/biller/*
    locations/archive_jobs_service.rb               ← extract from app/admin/locations
  (no GraphQL changes, no ActiveAdmin changes — Strangler Fig)

~/Helm                                 (new standalone Rails app)
  app/
    api/helm_api/v1/                   ← BFF for the React frontend
      base.rb
      users_api.rb
      companies_api.rb
      locations_api.rb
      audits_api.rb
      session_api.rb
    entities/                          ← Grape-Entity serializers, role-keyed PII
      user_entity.rb
      company_entity.rb
      merchant_profile_entity.rb
      location_entity.rb
      audit_event_entity.rb
    services/
      permission_service.rb                          (interface)
      permission_service/yaml_backend.rb             (default for MVP)
      permission_service/authz_backend.rb            (stub for future)
      audit_service.rb
      hb1_client/base.rb
      hb1_client/users.rb
      hb1_client/companies.rb
      hb1_client/locations.rb
    middleware/
      demo_identity.rb                 (reads HELM_DEMO_ROLE cookie → request.env[:helm_principal])
    models/
      admin_user.rb
      audit_event.rb
  client-helm/                         ← Vite + React + TS (mirrors ~/Homebase1/client)
    src/
      pages/UserLookup/{IndexPage,ShowPage,ImpersonateModal}.tsx
      pages/CompanyMerchant/{IndexPage,ShowPage,ChangeTierDrawer}.tsx
      pages/LocationManagement/{IndexPage,ShowPage,ArchiveJobsButton}.tsx
      components/{RoleSwitcher,AuditTrailTab,PiiField}.tsx
      lib/{api,permissions,pii}.ts
  config/
    permissions.yml                    (AuthZ-shaped: roles × permissions × scopes)
    routes.rb (mounts HelmApi::V1::Base + React index for /*)
  db/
    migrate/*  (admin_users, audit_events, sessions)
  scripts/
    scaffold-workflow.rb               (template generator)
  docs/handoff/
    TEMPLATE.md
    user_lookup.md                     (worked example)
    company_merchant.md                (worked example)
    location_management.md             (worked example)
```

### 2.2 Request topology

```
Browser ──▶ Helm React (client-helm)
               │
               ▼  fetch /helm_api/v1/users/123  (cookie: HELM_DEMO_ROLE)
        Helm Rails (BFF)
          1. middleware/demo_identity → resolves principal{role:cs_t1_agent}
          2. PermissionService.check(principal, "account.view_user", scope) → YAML backend
          3. Hb1Client::Users.show(123) ──▶ HB1 rpa_api/v1/users/123 (Bearer token)
                                                │
                                                ▼
                                          HB1 responds with canonical data
          4. UserEntity.represent(user, role: principal.role) ← PII conditionally exposed
          5. AuditService.record(...) → Postgres audit_events + Datadog log
          6. response → React (PII fields absent if redacted)
```

### 2.3 Key architectural properties

- **HB1 is the only source of truth for domain data.** Helm stores zero domain rows — only `admin_users`, `audit_events`, and sessions.
- **AuthZ-shape preserved.** The YAML schema (§3.1) mirrors AuthZ's `role → permissions[] × scope_type` model. When AuthZ supports admin reps, the runtime swap is `HELM_PERMISSION_BACKEND=authz`.
- **Demo cheat is one file.** `app/middleware/demo_identity.rb`. Production swaps it for `middleware/stytch_jwt.rb`. The identity contract (`request.env[:helm_principal]`) is unchanged.
- **Per-team migration is uniform.** Each pack team's workflow migration = add a Grape endpoint to HB1 + a controller/entity/page in Helm. The three MVP workflows are the canonical examples.

---

## 3. Permission System

### 3.1 YAML schema (`~/Helm/config/permissions.yml`)

AuthZ-shaped. Roles are flat — no inheritance — matching AuthZ's model.

```yaml
permissions:
  - { key: account.view_user,                  scope: human }
  - { key: account.view_pii,                   scope: human }
  - { key: account.verify_phone,               scope: human }
  - { key: account.resend_verification_email,  scope: human }   # v1.1
  - { key: account.edit_user,                  scope: human }   # v1.1
  - { key: account.impersonate_user,           scope: human }
  - { key: account.view_company,               scope: company }
  - { key: account.view_merchant_profile,      scope: company }
  - { key: account.view_sales_tax,             scope: company } # v1.1
  - { key: account.view_biller,                scope: company } # v1.1
  - { key: billing.update_subscription_tier,   scope: company }
  - { key: account.view_location,              scope: location }
  - { key: account.archive_location_jobs,      scope: location }
  # NOTE: archive_location_jobs is also used to authorize "unarchive jobs"
  # — both directions of the same operation share one permission (v1.1).

roles:
  cs_t1_agent:
    permissions:
      - account.view_user
      - account.verify_phone
      - account.resend_verification_email
      - account.view_company
      - account.view_merchant_profile
      - account.view_location

  cs_t2_payroll:
    permissions:
      - account.view_user
      - account.view_pii
      - account.verify_phone
      - account.resend_verification_email
      - account.edit_user
      - account.view_company
      - account.view_merchant_profile
      - account.view_sales_tax
      - account.view_biller
      - account.view_location

  cs_t2_payments:
    permissions:
      - account.view_user
      - account.view_pii
      - account.verify_phone
      - account.resend_verification_email
      - account.edit_user
      - account.view_company
      - account.view_merchant_profile
      - account.view_sales_tax
      - account.view_biller
      - billing.update_subscription_tier
      - account.view_location

  cs_t2_escalations:
    permissions:
      - account.view_user
      - account.view_pii
      - account.verify_phone
      - account.resend_verification_email
      - account.edit_user
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
      - account.view_sales_tax
      - account.view_biller
      - account.view_location

  eng_general:
    permissions:
      - account.view_user
      - account.view_pii
      - account.verify_phone
      - account.resend_verification_email
      - account.view_company
      - account.view_merchant_profile
      - account.view_location

  eng_super:
    permissions:
      - account.view_user
      - account.view_pii
      - account.verify_phone
      - account.resend_verification_email
      - account.edit_user
      - account.impersonate_user
      - account.view_company
      - account.view_merchant_profile
      - account.view_sales_tax
      - account.view_biller
      - billing.update_subscription_tier
      - account.view_location
      - account.archive_location_jobs

  eng_power:
    permissions:
      - "account.*"
      - "billing.*"   # wildcard only for eng_power, enforced via prefix match
```

### 3.2 PermissionService interface

```ruby
# app/services/permission_service.rb
module PermissionService
  Principal = Struct.new(:id, :role, :stytch_subject, keyword_init: true)
  Decision  = Struct.new(:allowed?, :reason, keyword_init: true)

  class Forbidden < StandardError; end

  def self.backend
    @backend ||= case ENV.fetch("HELM_PERMISSION_BACKEND", "yaml")
                 when "yaml"  then YamlBackend.new(Rails.root.join("config/permissions.yml"))
                 when "authz" then AuthZBackend.new
                 end
  end

  def self.check!(principal, permission_key, scope:)
    decision = backend.check(principal, permission_key, scope)
    raise Forbidden, decision.reason unless decision.allowed?
  end

  def self.permissions_for(principal)
    backend.permissions_for(principal)
  end
end
```

**Scope semantics for the YAML backend.** The `scope:` parameter is accepted on every check but the `YamlBackend` does not enforce row-level constraints — it just confirms the role holds the permission key. The scope is logged and passed through to the audit event so that, when `AuthZBackend` replaces it, AuthZ can enforce row-level rules (e.g. "this principal can only impersonate humans in companies they own") without changing the call sites. For MVP, scope is metadata of intent.

**Wildcard permissions.** Only `eng_power` is allowed wildcards (`account.*`, `billing.*`). The backend resolves `role.permissions` by exact match first, then prefix match against any entry ending in `.*`. Wildcards in non-`eng_power` roles are rejected at YAML load time.

### 3.3 Permission checks at the endpoint

```ruby
# app/api/helm_api/v1/users_api.rb
class HelmApi::V1::UsersApi < Grape::API
  helpers HelmApi::V1::AuthHelpers

  resource :users do
    route_param :id, type: Integer do
      get do
        check_permission!("account.view_user", scope: { human_id: params[:id] })
        user = Hb1Client::Users.show(params[:id])
        present user, with: Entities::User, role: current_principal.role_resolver
      end

      post :verification_sms do
        check_permission!("account.verify_phone", scope: { human_id: params[:id] })
        result = Hb1Client::Users.send_verification_sms(params[:id])
        AuditService.record(
          actor: current_principal,
          workflow: "user_lookup",
          action: "user.verification_sms_sent",
          resource_type: "User",
          resource_id: params[:id],
          payload_after: { sent_at: result.sent_at }
        )
        present result, with: Entities::VerificationResult
      end

      post :impersonate do
        check_permission!("account.impersonate_user", scope: { human_id: params[:id] })
        token = Hb1Client::Users.issue_impersonation_token(params[:id])
        AuditService.record(
          actor: current_principal,
          workflow: "user_lookup",
          action: "user.impersonation_started",
          resource_type: "User",
          resource_id: params[:id],
          payload_after: { expires_at: token.expires_at }
        )
        { redirect_url: token.url }
      end
    end
  end
end
```

### 3.4 Demo identity middleware (the cheat)

```ruby
# app/middleware/demo_identity.rb
class DemoIdentity
  def initialize(app) = @app = app

  def call(env)
    cookie_role = parse_cookie(env, "HELM_DEMO_ROLE") || ENV.fetch("HELM_DEMO_ROLE", "cs_t1_agent")
    env[:helm_principal] = PermissionService::Principal.new(
      id: 1, role: cookie_role, stytch_subject: nil
    )
    @app.call(env)
  end
end

# config/application.rb
config.middleware.use DemoIdentity
```

**Production swap:** replace `DemoIdentity` with `StytchJwtIdentity`. The contract — `request.env[:helm_principal]` — is unchanged.

### 3.5 React-side permission state

```ts
// client-helm/src/lib/permissions.ts
// On boot, fetch GET /helm_api/v1/session → { role, permissions: [...] }
// Stash in React context.
// Hook: usePermission("account.impersonate_user") → boolean
// Drives button visibility and other UI gating.
//
// Server is the enforcer. UI gating is for UX only — a deleted button does not bypass the check.
```

### 3.6 Governance flow

1. CS Tier 4 leader (or platform team) edits `~/Helm/config/permissions.yml`
2. Opens a PR
3. Merge → next deploy picks up new YAML
4. **No Ruby/JS code review needed.** No engineering ticket.

When AuthZ ready: same YAML feeds a `rake authz:sync` task that seeds AuthZ. `HELM_PERMISSION_BACKEND=authz` flips runtime.

---

## 4. Workflows & HB1 Endpoints

### 4.1 Workflow 1 — User Account Lookup

```
HB1 endpoints (under app/api/rpa_api/v1/users_api.rb)
  GET  /api/rpa_api/v1/users/:id                   [extend; already exists]
       → { id, email, full_name, phone, ssn_last4, bank_last4,
           created_at, last_sign_in_at, stytch_subject }
  POST /api/rpa_api/v1/users/:id/verification_sms  [new wrapper]
       → { sent_at, provider_request_id }
       Implementation: calls Identity::Users::SendVerificationSms service
                       (extracted from app/admin/users.rb:677)
  POST /api/rpa_api/v1/users/:id/impersonation_token  [new wrapper]
       → { url, expires_at }
       Implementation: calls Identity::Users::IssueImpersonationToken service
                       (extracted from app/admin/users.rb:565 login_user logic)

Helm endpoints
  GET  /helm_api/v1/users/:id          → UserEntity (PII conditional)
  POST /helm_api/v1/users/:id/verification_sms
  POST /helm_api/v1/users/:id/impersonate

Permissions consumed
  account.view_user           (read)
  account.view_pii            (controls phone/ssn/bank exposure)
  account.verify_phone        (verification_sms write)
  account.impersonate_user    (impersonate write — gated to cs_t2_escalations+)

PII fields (gated by account.view_pii)
  phone, ssn_last4, bank_last4 → omitted from response when permission absent

Audit events emitted
  user.verification_sms_sent
  user.impersonation_started   (high-sensitivity, always logged)
```

### 4.1.1 User Workflow extensions (v1.1)

APM rows added to scope:
1. View user detail — identity, memberships, jobs, bank account presence, MFA status (61.5% of user-workflow traffic)
2. Edit user — correct email, phone, or full name
3. Resend verification email

```
GET  /helm_api/v1/users/:id          (extended response, additive fields)
   { id, email, full_name, created_at, last_sign_in_at, stytch_subject,
     mfa_status, bank_account_present,        # v1.1
     memberships: [                            # v1.1
       { company_id, company_name, location_id, location_name,
         role_at_location, since }
     ],
     jobs: [                                   # v1.1
       { id, title, status, location_id, location_name, scheduled_for }
     ],
     phone?, ssn_last4?, bank_last4?,         (PII)
     _redacted }

PATCH /helm_api/v1/users/:id                  # v1.1
  body: { email?, phone?, full_name? }  (at_least_one_of)
  → updated User entity
  Permission: account.edit_user
  Audit:      user.edited (payload_before/after contain ONLY changed keys)
  Implementation: BFF fetches user via Hb1Client.show first to capture
                  payload_before, then PATCHes HB1 and writes the diff.

POST /helm_api/v1/users/:id/verification_email  # v1.1
  → { sent_at, provider_request_id, to_email }
  Permission: account.resend_verification_email
  Audit:      user.verification_email_sent

HB1 contract additions
  PATCH /api/rpa_api/v1/users/:id    body { email?, phone?, full_name? }
       → full user entity (so the BFF can audit the diff)
  POST  /api/rpa_api/v1/users/:id/verification_email
       → { sent_at, provider_request_id, to_email }
```

React UX (`pages/UserLookup/ShowPage.tsx`):
- Header chips: `MFA: enabled|disabled|unknown` (colored), `bank ✓` or `no bank`
- Tabs: Identity / Memberships (n) / Jobs (n) / Audit trail
- Action buttons (each gated by usePermission): Edit user, Resend verification SMS, Resend verification email, Impersonate
- `EditUserDialog` MUI modal — phone field disabled when in `_redacted`

### 4.2 Workflow 2 — Company Account & Merchant Profile

```
HB1 endpoints
  GET  /api/rpa_api/v1/companies/:id              [extend; already exists]
       → { id, name, tier, owner_user_id, stripe_customer_id?, ... }
  GET  /api/rpa_api/v1/companies/:id/merchant_profile   [new]
       → consolidated merchant-inspection payload
         (billing state, payment_method last4, tier, subscription dates,
          check entity ref, recent invoices summary)
       Implementation: extracts MerchantProfilePresenter composition
                       into Billing::MerchantProfileService
  POST /api/rpa_api/v1/companies/:id/billing_tier  [new wrapper]
       → { from_tier, to_tier, effective_at }
       Implementation: calls Billing::TierChangeService (extracted from app/admin/biller)

Helm endpoints
  GET  /helm_api/v1/companies/:id
  GET  /helm_api/v1/companies/:id/merchant_profile
  POST /helm_api/v1/companies/:id/billing_tier

Permissions consumed
  account.view_company
  account.view_merchant_profile
  account.view_pii                  (controls stripe_customer_id, payment_method last4)
  billing.update_subscription_tier  (the write)

PII fields (gated by account.view_pii)
  stripe_customer_id, payment_method_last4, invoice billing addresses

Audit events emitted
  company.billing_tier_changed   (payload_before + payload_after snapshot of tier)
```

**Note on MerchantProfilePresenter extraction:** This is the largest single piece of HB1 work in the MVP. The presenter is invoked twice per page load today (once via Rails, once via GraphQL — see Path-Forward Step 1) and accounts for 16% of all admin traffic. Extracting it into `Billing::MerchantProfileService` consumed by a REST endpoint kills the double-invocation problem and unblocks both Helm and the GraphQL sunset.

### 4.2.1 Company / Merchant extensions (v1.1)

APM rows added to scope:
1. View merchant profile — check entity, payroll readiness, missing-data flags
2. View company detail — tier, subscription, locations, payment attempts
3. View sales tax data — per-location tax records, exemptions (tiered visibility)
4. View biller details — locations, credit cards (last 4 only), tier history

```
GET  /helm_api/v1/companies/:id      (extended response, additive)
  Adds:
    subscription:     { status, started_at, renews_at },
    locations:        [{ id, name }, ...]       # links to /locations/:id
    payment_attempts: [{ id, amount_cents, status, attempted_at,
                         failure_reason }, ...]

GET  /helm_api/v1/companies/:id/merchant_profile   (extended response)
  Adds:
    payroll_readiness:  "ready"|"blocked"|"pending"|...,
    missing_data_flags: [ "<flag>", ... ],
    check_entity:       { id, name, ein_last4, status }

GET  /helm_api/v1/companies/:id/sales_tax           # v1.1 NEW
  → { company_id,
      aggregate_tax_collected_cents,
      per_location: [{ location_id, location_name, tax_authority,
                       tax_id, exempt, last_filed_at }, ...],
      exemptions:   [{ kind, granted_at, expires_at }, ...] }
  Permission: account.view_sales_tax (held by cs_t2_payroll, cs_t2_payments,
              cs_t4_leadership, eng_super, eng_power*)

GET  /helm_api/v1/companies/:id/biller              # v1.1 NEW
  → { company_id,
      locations:    [{ id, name }, ...],
      credit_cards: [{ brand, last4, exp_month, exp_year, primary }, ...],
                                                # PII-gated by account.view_pii
      tier_history: [{ tier, started_at, ended_at }, ...] }
  Permission: account.view_biller (same role set as view_sales_tax)
  PII:        credit_cards entirely omitted when role lacks account.view_pii;
              `_redacted` includes "credit_cards" so the UI shows an alert.

HB1 contract additions
  GET  /api/rpa_api/v1/companies/:id              (additive fields above)
  GET  /api/rpa_api/v1/companies/:id/merchant_profile  (additive fields above)
  GET  /api/rpa_api/v1/companies/:id/sales_tax
  GET  /api/rpa_api/v1/companies/:id/biller
```

React UX (`pages/CompanyMerchant/ShowPage.tsx`) — composite layout with five tabs:
- Header chips: `tier: <tier>`, `payroll: ready|blocked|...` (colored), `N missing` warning chip when `missing_data_flags` non-empty
- Tabs: Company / Merchant / Sales tax (conditional on `account.view_sales_tax`) / Biller (conditional on `account.view_biller`) / Audit trail
- **Company tab** sub-cards: Identity, Subscription, Locations (with `<RouterLink to="/locations/:id">`), Recent payment attempts (status chips)
- **Merchant tab** sub-cards: Payroll readiness (chips for missing flags), Check entity, Billing, Recent invoices
- **Sales tax tab**: aggregate cents → dollars, per-location records (cross-linked to /locations/:id), exemptions
- **Biller tab**: locations (cross-linked), credit cards (or "redacted for your role" alert), tier history

### 4.3 Workflow 3 — Location Management

```
HB1 endpoints
  GET  /api/rpa_api/v1/locations/:id              [new file: locations_api.rb]
       → { id, name, company_id, address, timezone, archived_at, ... }
  POST /api/rpa_api/v1/locations/:id/archive_jobs [new wrapper]
       → { archived_job_count, archived_at }
       Implementation: calls Locations::ArchiveJobsService

Helm endpoints
  GET  /helm_api/v1/locations/:id
  POST /helm_api/v1/locations/:id/archive_jobs

Permissions consumed
  account.view_location
  account.archive_location_jobs

PII fields
  none in this workflow (location data is non-PII)

Audit events emitted
  location.jobs_archived  (includes archived_job_count for forensics)
```

### 4.3.1 Location workflow extensions (v1.1)

APM rows added to scope:
1. View location detail — name, address, tier, jobs, partner (61.5% of location-workflow traffic)
2. Impersonate a user at the location (god-mode login at this location's context)
3. Archive / **unarchive** jobs at the location (archive shipped in v1; unarchive added in v1.1)

```
GET  /helm_api/v1/locations/:id      (extended response, additive)
  Adds:
    address:            "<street, city, state, zip>",
    tier:               "<inherits from company>",
    partner_name:       "<Square POS | Toast POS | ...>",
    job_count:          <int>,
    archived_job_count: <int>,
    users: [                                    # users employed at this location
      { id, name, email, role_at_location }, ...
    ]

POST /helm_api/v1/locations/:id/unarchive_jobs    # v1.1 NEW
  → { unarchived_job_count, unarchived_at }
  Permission: account.archive_location_jobs    (same key as archive — one perm
                                                authorizes both directions)
  Audit:      location.jobs_unarchived

POST /helm_api/v1/locations/:id/impersonate?user_id=N  # v1.1 NEW
  → { url, expires_at }
  Permission: account.impersonate_user (same as user-workflow impersonate)
  Audit:      location.user_impersonated (resource=Location, payload includes
                                          user_id + expires_at)
  Implementation: BFF calls Hb1Client::Users.issue_impersonation_token(user_id),
                  but writes the audit row scoped to the LOCATION resource so
                  the Location's audit tab shows the action in context.

HB1 contract additions
  GET  /api/rpa_api/v1/locations/:id          (additive fields above)
  POST /api/rpa_api/v1/locations/:id/unarchive_jobs
       → { unarchived_job_count, unarchived_at }
  (impersonate at-location reuses existing POST /users/:id/impersonation_token;
   only the audit-row resource differs)
```

React UX (`pages/LocationManagement/ShowPage.tsx`):
- Header chips: `tier: <tier>`, partner-name chip (yellow `info` color)
- Action buttons (gated): **Archive jobs** (contained warning), **Unarchive jobs** (outlined warning — disabled when `archived_job_count === 0`)
- Profile card adds: Address, Company id, Tier, Partner, Active jobs, Archived jobs
- **Users at this location** card — each row has a per-user **Impersonate** button (gated by `account.impersonate_user`); clicking writes the audit row to the Location, not the user

### 4.4 HB1-side extraction pattern (uniform)

Each new Grape endpoint follows the same skeleton. This is the per-pack-team template for future workflow migrations:

```ruby
# app/api/rpa_api/v1/users_api.rb (extended example)
module RpaApi
  module V1
    class UsersApi < ::Grape::API
      resource :users do
        route_param :id, type: Integer do
          desc "Send phone verification SMS"
          post :verification_sms do
            user = User.find(params[:id])
            result = Identity::Users::SendVerificationSms.call(user: user)
            present(result, with: Entities::VerificationResult)
          end

          desc "Mint a one-time impersonation URL"
          post :impersonation_token do
            user = User.find(params[:id])
            token = Identity::Users::IssueImpersonationToken.call(
              user: user, actor: current_token_actor
            )
            present(token, with: Entities::ImpersonationToken)
          end
        end
      end
    end
  end
end
```

Each `member_action` block in `app/admin/users.rb` → a service object + a Grape route. ActiveAdmin can continue to call the service object directly during Strangler Fig migration; nothing in ActiveAdmin breaks.

### 4.5 Frontend pages (Helm React)

```
pages/UserLookup/
  IndexPage.tsx        Search by email/phone/id (debounced); calls /helm_api/v1/users?q=
  ShowPage.tsx         Renders UserEntity; PII fields use <PiiField> component;
                       Buttons: VerifySms, Impersonate — visibility via usePermission()
  ImpersonateModal.tsx Confirm + opens redirect_url in new tab

pages/CompanyMerchant/
  ShowPage.tsx         Composite: company header + merchant profile sections;
                       ChangeTierDrawer for billing.update_subscription_tier

pages/LocationManagement/
  ShowPage.tsx         Location header + jobs section + ArchiveJobsButton

components/
  RoleSwitcher.tsx     Top-right dropdown; sets HELM_DEMO_ROLE cookie + reload
  AuditTrailTab.tsx    Reused across all three Show pages;
                       reads /helm_api/v1/audits?resource_type=X&resource_id=Y
  PiiField.tsx         Renders "•••••• 1234" placeholder when field is in _redacted[]
```

---

## 5. PII Masking, Audit, Observability

### 5.1 PII masking — at the serializer, never crosses the wire

```ruby
# app/entities/user_entity.rb
module Entities
  class User < Grape::Entity
    expose :id
    expose :email
    expose :full_name
    expose :created_at, :last_sign_in_at
    expose :stytch_subject

    with_options(if: ->(_, opts) { opts[:role].can?("account.view_pii") }) do
      expose :phone
      expose :ssn_last4
      expose :bank_last4
    end

    expose :_redacted do |_user, opts|
      opts[:role].can?("account.view_pii") ? [] : %w[phone ssn_last4 bank_last4]
    end
  end
end
```

The React side reads `_redacted` and renders consistent `"•••••• 1234"` placeholders via `<PiiField>`. The masked fields are absent from the JSON response, not hidden client-side.

### 5.2 Audit log — Postgres + Datadog log emit

```ruby
# db/migrate/.../create_audit_events.rb
create_table :audit_events do |t|
  t.bigint   :admin_user_id, null: false
  t.string   :role,          null: false
  t.string   :workflow,      null: false   # user_lookup | merchant_profile | location_management
  t.string   :action,        null: false   # user.impersonation_started | ...
  t.string   :resource_type, null: false   # User | Company | Location
  t.bigint   :resource_id,   null: false
  t.jsonb    :payload_before
  t.jsonb    :payload_after
  t.string   :request_id,    null: false   # ties to Datadog trace
  t.string   :ip
  t.datetime :occurred_at,   null: false
  t.timestamps
end
add_index :audit_events, [:resource_type, :resource_id]
add_index :audit_events, :admin_user_id
add_index :audit_events, :occurred_at
```

```ruby
# app/services/audit_service.rb
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
      request_id:     Datadog::Tracing.correlation.trace_id.to_s,
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
  end
end
```

Every write endpoint calls `AuditService.record`. The `AuditTrailTab` React component reads back via `GET /helm_api/v1/audits?resource_type=User&resource_id=123` so the demo can show the audit trail per resource.

**v1.1 — actor identification.** The `GET /helm_api/v1/audits` response joins `admin_users` (via `.includes(:admin_user)`) and includes `admin_user_email` + `admin_user_name` alongside `admin_user_id`. The React `AuditTrailTab` renders the actor label as `Name · email · #id`. This means every past audit row's displayed actor updates the moment an `AdminUser.full_name` is renamed (the row itself only stores `admin_user_id`). The demo seeder (`bin/demo-data`) accepts `HELM_DEMO_PERSON` env (default "Anumita Srivastava") so all nine seeded roles credit one real human in the demo, regardless of which role they're acting as.

**v1.1 — actions added since the original spec:**

```
user.edited                  payload_before/after include ONLY changed keys
                             (BFF fetches user first to compute the diff)
user.verification_email_sent payload_after: { sent_at, provider_request_id, to_email }
location.jobs_unarchived     payload_after: { unarchived_job_count, unarchived_at }
location.user_impersonated   resource=Location (NOT User); payload_after:
                             { user_id, expires_at }
```

### 5.3 Datadog instrumentation

**Traces.** `ddtrace` gem auto-instruments Grape and Rack. Every Helm endpoint produces a `rack.request` span with `resource_name: HelmApi::V1::UsersApi#GET /users/:id`. Manual span around each `Hb1Client` call so the HB1 round-trip is visible in flame graphs.

```ruby
# app/services/hb1_client/base.rb
def self.request(method, path, params: {})
  Datadog::Tracing.trace(
    "hb1.request",
    resource: "#{method.upcase} #{path}",
    tags: { "hb1.path" => path }
  ) do
    # HTTP call to HB1 with Bearer token
  end
end
```

**Logs.** Structured JSON via `lograge` + a `LogTagger` middleware that attaches `admin_user_id`, `role`, `request_id`, `workflow` to every log line. This solves the Path-Forward Step 3 Fix 5 gap ("attach `admin_user_id` to existing page-visit metric") by default on day one.

**Metrics** (via `Datadog::Statsd`):

```
helm.permission.check              tag:result=allow|deny, role, permission
helm.audit.recorded                tag:action, workflow
helm.hb1.request.duration          tag:endpoint, status
helm.impersonation.started         tag:actor_role        ← high-sensitivity counter
helm.pii.unmasked_field_accessed   tag:field, role       ← privacy signal
```

### 5.4 Datadog dashboard (ships with the demo)

```
┌─ Helm Admin Activity ──────────────────────────────────────────┐
│ Active sessions by role        | Permission denies last 24h    │
│ ─────────────────────────────  | ────────────────────────────  │
│ Top workflows by request count | Impersonations (last 24h)     │
│ ─────────────────────────────  | ────────────────────────────  │
│ HB1 round-trip p95 by endpoint | Audit events stream (live)    │
└────────────────────────────────────────────────────────────────┘
```

### 5.5 Datadog monitors

- `helm.impersonation.started > 5 in 5m` → Slack `#cs-leadership`
- `helm.permission.check{result=deny} > 50 in 5m` → possible misconfigured YAML
- `helm.hb1.request.duration p95 > 2s` → HB1 endpoint health

---

## 6. AI-Led Handoff Template

### 6.1 The scaffold generator

```bash
~/Helm/scripts/scaffold-workflow.rb <workflow_name> <hb1_pack>

# Generates, in ~/Helm:
client-helm/src/pages/<WorkflowName>/{IndexPage,ShowPage}.tsx
app/api/helm_api/v1/<workflow_name>_api.rb
app/entities/<resource>_entity.rb
app/services/hb1_client/<workflow_name>.rb
config/permissions.yml         (appends TODO permission entries)
docs/handoff/<workflow_name>.md (per-workflow runbook stub)

# And in HB1 (cross-repo templates):
app/api/rpa_api/v1/<workflow_name>_api.rb.template
app/services/<pack>/<workflow_name>/<action>_service.rb.template
```

### 6.2 Per-team migration checklist (`docs/handoff/TEMPLATE.md`)

```
1. [ ] Define permission keys in config/permissions.yml (domain.action_resource form)
2. [ ] Add HB1 Grape endpoint + extract service object from app/admin/*
3. [ ] Add Helm BFF endpoint + Grape-Entity serializer (PII conditional via account.view_pii)
4. [ ] Add React page; copy structure from pages/UserLookup as canonical example
5. [ ] Wire AuditService.record on every write
6. [ ] Add Datadog metric for any high-sensitivity action
7. [ ] Write the four required tests (see §7)
8. [ ] Update docs/handoff/<workflow>.md with role mapping + screenshots
```

The three MVP workflows ARE the canonical examples. When an AI agent is assigned workflow #4, the prompt is "read `docs/handoff/user_lookup.md` and apply the same pattern to <new workflow>." The pattern is documented, the scaffold is generated, the tests are stamped out.

---

## 7. Testing

Four required tests per workflow. Same shape every time so AI and humans don't argue about depth.

```ruby
# 1. Permission test — table-driven, one spec for all roles × permissions
# spec/services/permission_service_spec.rb
RSpec.describe PermissionService do
  [
    ["cs_t1_agent",       "account.view_user",                :allow],
    ["cs_t1_agent",       "account.view_pii",                 :deny],
    ["cs_t1_agent",       "account.impersonate_user",         :deny],
    ["cs_t2_escalations", "account.impersonate_user",         :allow],
    ["cs_t2_payments",    "billing.update_subscription_tier", :allow],
    ["eng_power",         "billing.update_subscription_tier", :allow],
  ].each do |role, perm, expected|
    it "#{role} -> #{perm} = #{expected}" do
      principal = PermissionService::Principal.new(id: 1, role: role, stytch_subject: nil)
      decision  = PermissionService.backend.check(principal, perm, {})
      expect(decision.allowed?).to eq(expected == :allow)
    end
  end
end

# 2. Entity PII test — masked fields stay off the wire
# spec/entities/user_entity_spec.rb
it "omits phone/ssn/bank when role lacks view_pii" do
  json = Entities::User.represent(user, role: role_for("cs_t1_agent")).serializable_hash
  expect(json).not_to have_key(:phone)
  expect(json[:_redacted]).to eq(%w[phone ssn_last4 bank_last4])
end

# 3. Endpoint integration test — full stack through Helm with HB1 stubbed via WebMock
# spec/requests/users_spec.rb
it "403s impersonate as cs_t1_agent, 200s as cs_t2_escalations" do
  set_role("cs_t1_agent")
  post "/helm_api/v1/users/123/impersonate"
  expect(response).to have_http_status(403)

  set_role("cs_t2_escalations")
  stub_hb1(:post, "/api/rpa_api/v1/users/123/impersonation_token",
           returns: { url: "https://hb1/login_as/abc", expires_at: "..." })
  post "/helm_api/v1/users/123/impersonate"
  expect(response).to have_http_status(200)
end

# 4. Audit test — every write creates exactly one audit_event
it "records audit on impersonate" do
  expect { post "/helm_api/v1/users/123/impersonate" }
    .to change(AuditEvent, :count).by(1)
  expect(AuditEvent.last.action).to eq("user.impersonation_started")
end
```

Frontend: Vitest unit tests for `PiiField`, `RoleSwitcher`, `usePermission` hook. No E2E for MVP.

---

## 8. Demo Runbook

```
1. bin/setup && bin/dev
   Rails on :3001, Vite on :5173, foreman starts both.

2. Open localhost:5173

3. Role switcher → cs_t1_agent
   Search user → show. PII masked. No impersonate button.

4. Switch → cs_t2_payments
   Same user. PII unmasked. Still no impersonate button.

5. Switch → cs_t2_escalations
   PII unmasked. IMPERSONATE button appears.
   Click → confirm modal → new tab opens (HB1 dev login).
   Audit Trail tab shows the impersonation row.

6. Open Datadog dashboard tab.
   helm.impersonation.started counter ticked.

7. Open config/permissions.yml in editor.
   Remove account.impersonate_user from cs_t2_escalations → save → reload.
   Impersonate button is gone. No code changes were made.

8. Open Company workflow.
   Try Change Tier as cs_t1_agent → 403, deny audited.
   Switch to cs_t2_payments → succeeds → audit row appears.

9. Open Location workflow.
   Archive jobs as cs_t1_agent → button absent.
   Switch to eng_super → archive succeeds → audit row.
```

Step 7 (editing YAML in front of the audience and seeing the UI respond) is the demo of "config-only permissions."

---

## 9. Repo Bootstrap

```
~/Helm/
  README.md                    60-second demo runbook, copy-paste commands
  bin/setup                    createdb, bundle, bun install, db:seed for demo data
  bin/dev                      foreman: Rails + vite + sidekiq
  bin/demo-data                seeds N admin_users across all 9 roles
  Procfile.dev
  .env.example                 HB1_API_BASE_URL, HB1_API_TOKEN, DATADOG_API_KEY,
                               HELM_PERMISSION_BACKEND=yaml, HELM_DEMO_ROLE=cs_t1_agent
  docs/
    architecture.md            §1–2 of this spec, evergreen
    permissions.md             how permissions.yml works + governance flow
    handoff/TEMPLATE.md
    handoff/user_lookup.md         worked example
    handoff/company_merchant.md    worked example
    handoff/location_management.md worked example
```

**Local Postgres** for `admin_users`, `audit_events`, `sessions`. Schema migrations versioned in `~/Helm/db/migrate/`. No domain data stored.

**Gemfile (key entries):**

```ruby
gem "rails", "~> 7.x"
gem "pg"
gem "grape"
gem "grape-entity"
gem "puma"
gem "datadog", "~> 2.0", require: false
gem "lograge"
gem "faraday"               # HB1 client transport
gem "sidekiq"               # for async audit emit / background SMS retries
gem "dotenv-rails", groups: %i[development test]
group :test do
  gem "rspec-rails"
  gem "webmock"
  gem "factory_bot_rails"
end
```

**Frontend (`client-helm/package.json`) mirrors `~/Homebase1/client`:**

```json
{
  "dependencies": {
    "react": "^18", "react-dom": "^18", "react-router-dom": "^6",
    "@tanstack/react-query": "^5",
    "@emotion/react": "^11", "@emotion/styled": "^11",
    "@mui/material": "^5"
  },
  "devDependencies": {
    "vite": "^5", "typescript": "^5",
    "vitest": "^1", "@testing-library/react": "^14"
  }
}
```

Bun for the install/runtime (matches HB1 `client/`).

---

## 10. Out of Scope (explicit follow-ups)

- **Okta SSO integration** — cheated via `DemoIdentity` middleware. Production swap is a separate plan, gated on AuthZ supporting admin-rep principals.
- **AuthZ runtime gRPC** — `AuthZBackend` is stubbed. When Identity team enables admin-rep reconciliation, swap via `HELM_PERMISSION_BACKEND=authz` + `rake authz:sync`.
- **Lattice impersonation** — Helm uses HB1's existing `login_user` mechanism. Lattice integration is a future migration of where the impersonation URL comes from.
- **Session-exit audit logging** — known gap per Path-Forward Step 3.1. Requires HB1 to call back to Helm on logout.
- **Row-level scoping** — resource-type scoping only. "Only see companies in your region" is a future iteration.
- **Workflows 4+** — Stytch/Identity, Cash Out, Hiring, etc. Each pack team's responsibility, following the handoff template.
- **HomeBase::Events emission** — local Postgres + Datadog log only for MVP. Wiring to HB1's domain event bus is a future iteration once a downstream consumer (per Path-Forward Step 3.2 Fix 2) is confirmed.
- **CI / deploy infra** — demo is local-only. Production deploy (Render/k8s/etc.) is a separate plan.
- **End-to-end browser tests** — Vitest unit tests only.
- **Production rate limiting and request signing on the HB1 client** — Bearer-token only for MVP.

---

## 11. References

**Confluence:**
- [Admin Panel: Path Forward](https://joinhomebase.atlassian.net/wiki/spaces/CE1/pages/5040799765/) (5040799765) — Steps 1–4, Section 2.5 permission matrix
- [Getting Started with AuthZ](https://joinhomebase.atlassian.net/wiki/spaces/AAAI/pages/5030838307/) (5030838307) — principal types, scope types, naming conventions

**HB1 codebase (for extraction):**
- `app/admin/users.rb:565` — `login_user` collection_action (impersonation source)
- `app/admin/users.rb:677` — `send_verification_sms` member_action
- `app/admin/biller/*.rb` — billing tier change logic
- `app/admin/locations` — archive jobs logic
- `app/presenters/merchant_profile_presenter.rb` — composition logic to extract
- `app/api/rpa_api/v1/users_api.rb` — existing Grape pattern to extend
- `app/api/rpa_api/v1/companies_api.rb` — existing Grape pattern to extend
- `config/initializers/cancan_active_admin.rb` — current auth model (replaced, not migrated)

**Memory:**
- `project_admin_mvp_replacement.md` — APM-verified workflow priorities
- `reference_admin_usage_apm.md` — how to measure admin usage in Datadog
- `feedback_no_graphql.md` — no GraphQL in HB1
