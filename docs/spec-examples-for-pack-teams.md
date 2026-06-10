# Helm migration spec — examples for pack teams

If your pack team is about to migrate a workflow from `app/admin/*` into Helm, write the spec **before** scaffolding. The spec is what gets reviewed; the code is the implementation of the spec.

Below are three example specs at different sizes. Pick whichever shape best matches your workflow, copy it, and replace the contents.

The canonical reference spec (the full Helm MVP design) is at `docs/2026-06-09-helm-mvp-design.md` — those examples follow the same structure.

---

## Small example — single-action workflow

**Use this shape when:** the workflow is one verb on one resource. No PII concerns, no composite view, no sub-resources.

### Spec: Approve flagged job post

**Owner:** Hiring pack
**APM traffic share:** ~0.8% of admin actions
**Status:** Spec drafted; not yet scaffolded.

#### Overview
Today an admin clicks "Approve" in ActiveAdmin on a `JobPost` row that's been flagged by the trust-and-safety pipeline. The action does one thing: mark `flagged_at = nil` and write a `job_post_approvals` row. We're migrating this to Helm so the action is permission-gated, audited, and visible alongside other moderation work.

#### Permissions

```yaml
# Add to config/permissions.yml
- { key: account.approve_job_post, scope: job_post }

# Held by:
#   cs_t2_escalations
#   eng_super
#   eng_power (wildcard)
```

#### Endpoints

```
GET  /helm_api/v1/job_posts/:id
  → { id, title, company_name, location_name, flagged_at, flagged_reason,
      created_at, posted_by_user_id }
  Permission: account.view_job_post (existing)

POST /helm_api/v1/job_posts/:id/approve
  → { approved_at }
  Permission: account.approve_job_post
  Audit:      job_post.approved
              payload_after: { approved_at }

HB1 contract additions
  POST /api/rpa_api/v1/job_posts/:id/approve
       → { approved_at }
       Implementation: calls Hiring::JobPosts::ApproveService
                       (extracted from app/admin/job_posts.rb)
```

#### PII
None. Job-post text is public.

#### Audit events
- `job_post.approved` — written before HB1 response is returned, payload contains `approved_at`

#### React UX
- One new page at `/job_posts/:id` (Show only — no Index/search; the page is reached from the moderation queue, which links here)
- Single **Approve** button gated by `usePermission("account.approve_job_post")`
- Confirm dialog ("Approve this job post? It will become visible to applicants.")
- Audit trail tab (reusable component)

#### Done when
- `bundle exec rspec spec/requests/job_post_moderation_spec.rb` — 4 examples (403 / 200 / audit row / Hb1Client wrapper)
- `bun run test src/pages/JobPostModeration` — 1 vitest spec
- HB1 PR landed (extracted service + Grape POST route)
- Demo: as `cs_t1_agent` the Approve button is hidden; as `cs_t2_escalations` clicking it writes an audit row

**Estimated effort:** 1 day Helm side · 0.5 day HB1 side.

---

## Medium example — multi-action workflow with PII

**Use this shape when:** there's a primary resource with 2–4 verbs, some fields are PII, and the demo needs to show the PII gating story.

### Spec: Cash Out review

**Owner:** Cash Out pack
**APM traffic share:** ~4.2% of admin actions
**Status:** Spec drafted; not yet scaffolded.

#### Overview
Admins review pending Cash Out (instant pay) requests, approving or rejecting based on fraud signals. Today this is three ActiveAdmin pages stitched together: `Payouts#show`, `BankAccounts#show`, and a custom verification form. In Helm it's one workflow page with the three actions baked in.

#### Permissions

```yaml
# Add to config/permissions.yml
- { key: account.view_payouts,        scope: human }
- { key: account.approve_payout,      scope: human }
- { key: account.reject_payout,       scope: human }

# Held by:
#   cs_t2_payments       (all three)
#   cs_t2_escalations    (all three)
#   eng_super            (all three)
#   eng_power            (via wildcard)
#   cs_t1_agent          (view only — no approve/reject)
```

#### Endpoints

```
GET  /helm_api/v1/payouts/:id
  → { id, user_id, amount_cents, status, requested_at, fraud_score,
      bank_routing_last4?, bank_account_last4?,   # PII
      _redacted }
  Permission: account.view_payouts

POST /helm_api/v1/payouts/:id/approve
  → { approved_at, transfer_id }
  Permission: account.approve_payout
  Audit:      payout.approved
              payload_before: { status: "pending" }
              payload_after:  { status: "approved", transfer_id, approved_at }

POST /helm_api/v1/payouts/:id/reject
  body: { reason: String }
  → { rejected_at, reason }
  Permission: account.reject_payout
  Audit:      payout.rejected
              payload_after: { reason, rejected_at }

HB1 contract additions
  GET  /api/rpa_api/v1/payouts/:id   (extend existing if not already exposed)
  POST /api/rpa_api/v1/payouts/:id/approve
  POST /api/rpa_api/v1/payouts/:id/reject  body { reason }
       Service objects: CashOut::Payouts::Approve, CashOut::Payouts::Reject
```

#### PII fields (gated by `account.view_pii`)
- `bank_routing_last4`
- `bank_account_last4`

Other PII (full account numbers, user SSN, full bank address) is **never** exposed to Helm. If the team thinks it might be needed for a fraud investigation, that's a separate spec for a separate permission.

#### Audit events
- `payout.approved` — captures `payload_before.status` and `payload_after.transfer_id` so we can reconstruct decisions weeks later
- `payout.rejected` — payload includes the operator's `reason` (free text, 200 char max)

#### React UX
- Routes: `/payouts/:id`
- Show page tabs: **Payout** (amount, status, fraud score, bank PII via PiiField) · **Audit trail**
- Two action buttons: **Approve** (warning color) · **Reject** (opens a modal asking for a reason)
- Snackbar on success ("Payout approved · transfer pi_…")

#### Done when
- Backend: 5 request specs (2 permission denials, 2 success paths with audit, 1 reject-without-reason validation error)
- Frontend: 3 vitest specs (page renders, approve flow, reject modal)
- HB1 PR landed for both services + entity + route
- Demo: switching from `cs_t1_agent` (view-only, PII hidden) → `cs_t2_payments` (PII visible, both buttons appear) → click Reject, modal asks for reason, audit row shows the reason text

**Estimated effort:** 3 days Helm side · 2 days HB1 side.

---

## Large example — composite workflow with sub-resources + tiered visibility

**Use this shape when:** the workflow is a multi-tab "investigation" view, has multiple sub-resources, and different role tiers should see different sections.

### Spec: Payroll compliance review

**Owner:** Payroll pack (+ Compliance team)
**APM traffic share:** ~5.8% of admin actions
**Status:** Spec drafted; not yet scaffolded.

#### Overview
When a merchant's payroll fails, admins need a single page that shows: *why* it failed, what state the merchant's tax setup is in, what historical filings look like, and what compliance flags are open. Today this is six separate ActiveAdmin pages (`TaxFilings`, `W4Submissions`, `I9Verifications`, `PayrollRuns`, `ComplianceFlags`, `BankConnections`). Compliance team can see filings; payroll support cannot. This is a workflow, not six tables.

#### Permissions

```yaml
# Add to config/permissions.yml
- { key: account.view_payroll_compliance,         scope: company }
- { key: account.view_payroll_compliance_history, scope: company }  # tiered
- { key: account.view_tax_filings,                scope: company }  # tiered
- { key: account.update_compliance_flag,          scope: company }
- { key: account.retry_payroll_run,               scope: company }

# Tiered visibility:
#   cs_t2_payroll        : view_payroll_compliance, retry_payroll_run
#   cs_t4_leadership     : + view_payroll_compliance_history, view_tax_filings
#   compliance_officer   : + update_compliance_flag (new role — see §below)
#   eng_super            : all of the above
#   eng_power            : wildcard
#
# Tier 1, Tier 2 Payments, Tier 3 Ops: no access (workflow is not in their queue).
```

**Note:** This spec introduces a new role `compliance_officer`. Adding a role is a YAML edit + a brief socialization with CS leadership; no code change.

#### Endpoints

```
GET  /helm_api/v1/companies/:id/payroll_compliance
  → { company_id, current_state, last_run_at, last_run_status,
      open_flags: [{ id, kind, opened_at, severity }],
      bank_connection: { status, last_synced_at } }
  Permission: account.view_payroll_compliance

GET  /helm_api/v1/companies/:id/payroll_compliance/history
  → { runs: [{ id, status, started_at, finished_at, employee_count,
                 total_gross_cents }, ...] }   # last 12 months
  Permission: account.view_payroll_compliance_history

GET  /helm_api/v1/companies/:id/payroll_compliance/tax_filings
  → { filings: [{ id, period, authority, status, filed_at,
                  total_withheld_cents, last4_tax_id }] }  # last4_tax_id is PII
  Permission: account.view_tax_filings

POST /helm_api/v1/companies/:id/payroll_compliance/flags/:flag_id/resolve
  body: { resolution: String, action_taken: String }
  → { flag_id, resolved_at, resolved_by }
  Permission: account.update_compliance_flag
  Audit:      payroll_compliance.flag_resolved
              payload_before: { status: "open" }
              payload_after:  { status: "resolved", resolution, action_taken }

POST /helm_api/v1/companies/:id/payroll_compliance/retry_run
  body: { run_id: Integer }
  → { run_id, retried_at, new_status }
  Permission: account.retry_payroll_run
  Audit:      payroll_compliance.run_retried
              payload_after: { run_id, new_status }

HB1 contract additions
  GET  /api/rpa_api/v1/companies/:id/payroll_compliance              (new composite)
  GET  /api/rpa_api/v1/companies/:id/payroll_compliance/history
  GET  /api/rpa_api/v1/companies/:id/payroll_compliance/tax_filings
  POST /api/rpa_api/v1/companies/:id/payroll_compliance/flags/:fid/resolve
  POST /api/rpa_api/v1/companies/:id/payroll_compliance/retry_run

  Services to extract:
    Payroll::Compliance::OverviewService    (composes 4 existing presenters)
    Payroll::Compliance::HistoryService
    Payroll::Compliance::TaxFilingsService
    Payroll::Compliance::ResolveFlagService
    Payroll::Compliance::RetryRunService
```

#### PII fields (gated by `account.view_pii`)
- `tax_filings[*].last4_tax_id`
- Anything in employee-level breakdowns when we add those in v2 (not in this spec)

#### Audit events
- `payroll_compliance.flag_resolved` — before/after status diff plus the operator's `resolution` and `action_taken` strings (these become the searchable record of why this flag was closed)
- `payroll_compliance.run_retried` — payload includes the `run_id` and the new status post-retry

#### React UX
- Route: `/companies/:id` → adds a **Payroll compliance** tab (conditional on `account.view_payroll_compliance`)
- Inside the Payroll compliance tab, **sub-tabs**:
  - **Overview** — always visible. Current state, last run status, open flags (each clickable → Resolve modal), bank connection status.
  - **History** — visible only with `account.view_payroll_compliance_history`. Year of runs with status chips.
  - **Tax filings** — visible only with `account.view_tax_filings`. Per-period filings, PII-gated `last4_tax_id`.
  - **Audit trail** — uses the shared `AuditTrailTab` component scoped to this Company.
- Action affordances:
  - **Resolve flag** modal — required fields `resolution` (textarea) + `action_taken` (textarea), submit button disabled until both filled
  - **Retry payroll run** button on Overview tab — confirm dialog
- The Payroll Compliance tab itself is hidden if the role lacks `account.view_payroll_compliance`. Tier 1 doesn't even see it exists.

#### Done when
- Backend: 12 request specs covering every role × endpoint combination's permission outcome, plus diff-audit on resolve, plus an integration test that retries a payroll run and asserts the audit row
- Frontend: 6 vitest specs (overview rendering, sub-tab gating, resolve modal validation, retry confirm flow, tax filings PII gating, history sort)
- HB1 PR: 5 service objects + 5 Grape routes, with the composite Overview service replacing 4 individual presenter calls that today get invoked twice each per page load (perf win)
- Demo plan covers four role-switch beats: `cs_t1_agent` (no tab visible), `cs_t2_payroll` (Overview + Retry only), `cs_t4_leadership` (+ History + Tax filings), `compliance_officer` (+ Resolve flags). Each role's audit-tab view shows different rows because each role takes different actions.

#### Out of scope (explicit)
- Employee-level payroll detail (next spec, requires `view_employee_pii`)
- Push notifications to merchant about resolution (Comms pack)
- Automatic flag re-opening if conditions reappear (Compliance pack pipeline, not Helm)
- Bulk retry across companies (future tooling)

**Estimated effort:** 8 days Helm side · 5 days HB1 side · 2 days CS-leadership alignment on the `compliance_officer` role.

---

## After you have a spec

Whichever size you picked, the next steps are the same:

1. **Get the spec reviewed.** CS leadership / pack lead / product. Sign off in writing.
2. **Run the scaffold:**
   ```bash
   scripts/scaffold-workflow.rb <workflow_snake> <resource_snake>
   ```
3. **Read the worked example:** `docs/handoff/user_lookup.md` shows what "scaffold output + filled-in deltas" looks like end-to-end.
4. **Follow the per-team checklist:** `docs/handoff/TEMPLATE.md` is the 10-step migration list.
5. **Hand the `tmp/hb1-out/<workflow>/` templates** to your HB1 owner.

The spec lives in the repo as `docs/specs/<YYYY-MM-DD>-<workflow>.md` once approved, alongside the existing MVP design doc.

---

## Quick reference — what every spec needs

Regardless of size, every Helm migration spec must answer:

| Section | Question |
|---------|----------|
| Overview | What is the workflow today, and why migrate it? |
| Owner + APM share | Which pack owns it, and how much admin traffic is it? |
| Permissions | What permission keys are needed; which roles hold each? |
| Endpoints | What does Helm expose; what does HB1 need to add? |
| PII | Which fields are gated by `account.view_pii`? |
| Audit events | Which writes audit; what's in `payload_before` / `payload_after`? |
| React UX | Pages, tabs, action buttons, conditional rendering rules |
| Done when | The concrete tests and demo beats that prove it works |
| Out of scope | What this spec deliberately doesn't cover (so v2 has a starting point) |

If your spec doesn't answer all of those, it's not ready to scaffold from.
