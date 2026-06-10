# Helm Workflow Spec — User Account Lookup

**Owner:** Identity pack
**APM traffic share:** 43.8% of admin actions (largest of the three MVP workflows)
**Status:** Built. Helm side at `helm-workflow1-v1-helm-only`; HB1 changes pending — see `docs/handoff/hb1-workflow1-user-lookup.md`.
**Spec dates:** v1.0 — 2026-06-09 (original). v1.1 — 2026-06-10 (detail expansion + edit + resend email).

This is the **real spec** for the User Account Lookup workflow as it ships in Helm today. It's the canonical pattern other workflow specs should mirror. The smaller `docs/specs/` documents you write for your own workflow follow the same structure.

---

## Overview

A CS agent investigating a customer issue starts by finding the user — by email, phone, or id. Today this is `app/admin/users.rb` in ActiveAdmin: a search index, a Show page with every column, and a handful of bespoke `member_action` blocks (impersonate, verify SMS, edit) that were added one at a time over years. There's no permission gating beyond "can log into admin," there's no audit trail, and PII is visible to anyone who can see the page.

In Helm, this becomes one workflow page with **tabbed sections matching the questions agents actually ask** — identity, where this user works, what shifts they have, what actions have been taken on this account. PII is server-side redacted per role. Impersonation is a discrete, gated, audited permission. Every edit captures the before/after diff. Every write writes an audit row before the response renders.

---

## Permissions

```yaml
# All five live in config/permissions.yml (the source of truth).
- { key: account.view_user,                  scope: human }
- { key: account.view_pii,                   scope: human }
- { key: account.verify_phone,               scope: human }   # SMS verification
- { key: account.resend_verification_email,  scope: human }   # v1.1
- { key: account.edit_user,                  scope: human }   # v1.1
- { key: account.impersonate_user,           scope: human }
```

Role distribution (excerpt from `config/permissions.yml`):

| Permission | Tier 1 | T2 Payroll | T2 Payments | T2 Escalations | T3 Ops | T4 Leadership | eng_general | eng_super | eng_power |
|---|---|---|---|---|---|---|---|---|---|
| `account.view_user` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `account.view_pii` |   | ✓ | ✓ | ✓ |   | ✓ | ✓ | ✓ | ✓ |
| `account.verify_phone` | ✓ | ✓ | ✓ | ✓ |   |   | ✓ | ✓ | ✓ |
| `account.resend_verification_email` | ✓ | ✓ | ✓ | ✓ |   |   | ✓ | ✓ | ✓ |
| `account.edit_user` |   | ✓ | ✓ | ✓ |   |   |   | ✓ | ✓ |
| `account.impersonate_user` |   |   |   | **✓** |   |   |   | **✓** | **✓** |

**Impersonate is held by exactly three of nine roles.** This is the "no god mode" guarantee for this workflow.

---

## Endpoints

### Helm BFF endpoints

```
GET  /helm_api/v1/users?q=<query>
  → [{ id, email, full_name }, ...]  # ≤ 25 results
  Permission: account.view_user

GET  /helm_api/v1/users/:id
  → { id, email, full_name, created_at, last_sign_in_at, stytch_subject,
      mfa_status, bank_account_present,
      memberships: [
        { company_id, company_name, location_id, location_name,
          role_at_location, since }
      ],
      jobs: [
        { id, title, status, location_id, location_name, scheduled_for }
      ],
      phone?, ssn_last4?, bank_last4?,                            # PII-gated
      _redacted: ["phone", "ssn_last4", "bank_last4"] | [] }
  Permission: account.view_user

PATCH /helm_api/v1/users/:id
  body: { email?, phone?, full_name? }   (at_least_one_of required)
  → updated User entity
  Permission: account.edit_user
  Audit:      user.edited
              payload_before/after contain ONLY changed keys
  Implementation: BFF reads via Hb1Client.show first to capture before-state,
                  then PATCHes HB1, then computes the diff for audit.

POST /helm_api/v1/users/:id/verification_sms
  → { sent_at, provider_request_id }
  Permission: account.verify_phone
  Audit:      user.verification_sms_sent

POST /helm_api/v1/users/:id/verification_email
  → { sent_at, provider_request_id, to_email }
  Permission: account.resend_verification_email
  Audit:      user.verification_email_sent

POST /helm_api/v1/users/:id/impersonate
  → { url, expires_at }
  Permission: account.impersonate_user
  Audit:      user.impersonation_started   (HIGH-sensitivity, written before
                                            URL returned to the browser)
```

### HB1 contract (the Identity pack ships these)

```
GET   /api/rpa_api/v1/users/:id              (extend existing — adds memberships,
                                              jobs, mfa_status, bank_account_present)
GET   /api/rpa_api/v1/users?q=<query>        (extend existing)

PATCH /api/rpa_api/v1/users/:id              (new)
       body { email?, phone?, full_name? }
       → full user entity (so BFF can audit the diff)

POST  /api/rpa_api/v1/users/:id/verification_sms       (new wrapper around
                                                       Identity::Users::SendVerificationSms,
                                                       extracted from
                                                       app/admin/users.rb:677)
POST  /api/rpa_api/v1/users/:id/verification_email     (new)
POST  /api/rpa_api/v1/users/:id/impersonation_token    (new wrapper around
                                                       Identity::Users::IssueImpersonationToken,
                                                       extracted from
                                                       app/admin/users.rb:565)
```

All requests carry `Authorization: Bearer <RPA_API_TOKEN>`. Full HB1 punch list at `docs/handoff/hb1-workflow1-user-lookup.md`.

---

## PII fields

Gated by `account.view_pii`:

- `phone`
- `ssn_last4`
- `bank_last4`

When the role lacks `account.view_pii`, these fields are **absent from the JSON response** — not hidden by CSS, physically not on the wire. The entity returns `_redacted: ["phone", "ssn_last4", "bank_last4"]` so the React `PiiField` component knows to render `••••` placeholders.

`bank_account_present` (boolean) is non-PII — it answers "does this user have *any* bank account on file?" without exposing the account number itself. Available to all roles with `account.view_user`.

`mfa_status` (string: `"enabled"` / `"disabled"` / `"unknown"`) is also non-PII; useful for triaging support tickets.

---

## Audit events

Five action keys emitted from this workflow:

| Action | Payload shape |
|--------|---------------|
| `user.edited` | `payload_before` + `payload_after`, each containing **only the keys that actually changed** |
| `user.verification_sms_sent` | `payload_after: { sent_at, provider_request_id }` |
| `user.verification_email_sent` | `payload_after: { sent_at, provider_request_id, to_email }` |
| `user.impersonation_started` | `payload_after: { expires_at }` |
| `location.user_impersonated` | Emitted by the **Location workflow** when impersonating a user from a location's context; resource_type is `Location` not `User`. Listed here for completeness — the audit table shows up under whichever resource framed the action. |

Every audit row also captures: `admin_user_id` (resolved to email + name on read), `role`, `workflow: "user_lookup"`, `resource_type: "User"`, `resource_id`, `request_id` (ties to Datadog trace), `ip`, `occurred_at`.

The audit row is written **before** the response is returned to the browser. A network failure between Helm and the browser does not lose the audit.

---

## React UX

Routes: `/users` (Index/search) and `/users/:id` (Show).

**Index page** (`pages/UserLookup/IndexPage.tsx`):
- Single search input, 250ms debounce, calls `/helm_api/v1/users?q=`
- Results list — each row links to the Show page

**Show page** (`pages/UserLookup/ShowPage.tsx`):
- Header: name + email, chips for `MFA: enabled` (colored) and `bank ✓` / `no bank`
- Action buttons (each gated by `usePermission(...)`):
  - **Edit user** (outlined) — opens `EditUserDialog` modal
  - **Resend verification SMS** (outlined)
  - **Resend verification email** (outlined)
  - **Impersonate** (contained warning) — opens `ImpersonateModal` confirm
- Tabs:
  - **Identity** — full name, email, PII fields (via `PiiField` for each — automatic `••••` when redacted), bank-on-file Yes/No, MFA status, Stytch subject, created_at, last_sign_in_at
  - **Memberships (N)** — list of `{company_name → location_name, role_at_location, since}`
  - **Jobs (N)** — list of `{title, status chip, location_name, scheduled_for}`
  - **Audit trail** — reuses shared `AuditTrailTab` component, scoped to this User

**Edit modal** (`EditUserDialog.tsx`):
- Three fields: Full name, Email, Phone
- Phone field disabled if `data.phone === undefined` (PII redacted for this role — can't edit what you can't see)
- Save button disabled until at least one field changes
- Calls `PATCH /helm_api/v1/users/:id`; on success, invalidates the user + audit react-query keys

**Impersonate modal** (`ImpersonateModal.tsx`):
- Confirm dialog with explicit copy ("This will mint a one-time login URL and open it in a new tab. The action is logged...")
- Cancel is a no-op (no audit row, no token)
- Confirm calls `POST /helm_api/v1/users/:id/impersonate`, opens `result.url` in a new tab

---

## Done when (acceptance criteria)

**Backend** — all in `spec/`:
- 7 request specs in `users_spec.rb` covering: PII present/absent per role, search results, impersonate 403/200/audit-row, verification_sms permission gating, edit with diff audit, verify-email permission gating
- 4 Hb1Client wrapper specs (`hb1_client/users_spec.rb`)
- 3 entity PII specs (`entities/user_spec.rb`)
- All green: `bundle exec rspec` reports 0 failures (current: 95 examples total across all workflows)

**Frontend** — all in `client-helm/src/`:
- Vitest specs for `UserLookup/{IndexPage,ShowPage,ImpersonateModal,EditUserDialog}`
- All green: `cd client-helm && bun run test` reports 0 failures

**Demo path** (the live demo proves it works):
1. `cs_t1_agent` opens user 42 — PII is `••••`, no Impersonate button, no Edit button
2. Switch to `cs_t2_payroll` — PII visible, Edit button appears, still no Impersonate
3. Edit the user's full name — audit tab shows `user.edited` with old/new values
4. Switch to `cs_t2_escalations` — Impersonate appears
5. Click Impersonate → confirm → new tab opens → audit tab shows the row
6. Remove `account.impersonate_user` from `cs_t2_escalations` in YAML → restart Rails → button disappears (config-driven permissions demo)

**HB1 side** (out of scope for Helm; tracked in handoff doc):
- `Identity::Users::SendVerificationSms` extracted from `app/admin/users.rb:677`
- `Identity::Users::IssueImpersonationToken` extracted from `app/admin/users.rb:565`
- Five new POST/PATCH routes added to `app/api/rpa_api/v1/users_api.rb`
- ActiveAdmin actions reduced to one-line calls to the extracted services
- Existing admin specs still passing

---

## Out of scope (explicit)

- **Bulk user export.** No `/users.csv` endpoint. If support ever needs it, a separate spec gates it behind a new permission held by no one by default.
- **Editing fields beyond `email`/`phone`/`full_name`.** Changing SSN, bank, or stytch_subject is out of scope; those flow through Identity-pack-owned UIs.
- **Account deletion / archival.** Belongs to a separate "Privacy" workflow.
- **Reading session history.** The audit trail covers admin-driven actions; user session history is observability, not admin.
- **Cross-user search** (e.g., "all users on this bank account"). Would require a new permission and a separate spec.
- **Stytch JWT integration.** Today's `DemoIdentity` middleware reads the `HELM_DEMO_ROLE` cookie; production migration to Stytch is a separate plan that doesn't touch this spec — the `env[:helm_principal]` contract is unchanged.

---

## References

- Canonical spec context: `docs/2026-06-09-helm-mvp-design.md` §4.1 + §4.1.1
- Implementation plan: `docs/superpowers/plans/2026-06-09-helm-workflow1-user-lookup.md`
- HB1 handoff punch list: `docs/handoff/hb1-workflow1-user-lookup.md`
- Worked example for new workflows: `docs/handoff/user_lookup.md` (this same workflow, with the scaffold/deltas writeup)
- Code (Helm side): `app/api/helm_api/v1/users_api.rb`, `app/api/entities/user.rb`, `app/services/hb1_client/users.rb`, `client-helm/src/pages/UserLookup/`
