# Worked example — User Account Lookup (Workflow 1)

This is what `scripts/scaffold-workflow.rb user_lookup user` produces, then how the deltas were filled in to get to the actual code that ships under `helm-workflow1-v1-helm-only`.

If you're starting a new workflow, follow `docs/handoff/TEMPLATE.md` step-by-step. This doc shows what "filled in" looks like.

## What the scaffold produced

After running `scripts/scaffold-workflow.rb user_lookup user`, you get:

- `app/api/entities/user.rb` — entity with `id`, `name`, `created_at` only. No PII. `_redacted` always empty.
- `app/api/helm_api/v1/user_lookup_api.rb` — Grape class with `GET /users` (search) and `GET /users/:id` (show). No POST routes.
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

1. As `cs_t1_agent`: PII masked. Verify SMS button visible (because `cs_t1_agent` holds `account.verify_phone` in the YAML).
2. As `cs_t2_payroll`: PII visible. Impersonate button NOT visible.
3. As `cs_t2_escalations`: PII visible. Impersonate button visible. Click → confirm → new tab opens to HB1's `login_as` URL. Audit trail shows the row.
4. Edit `config/permissions.yml`, remove `account.impersonate_user` from `cs_t2_escalations`, restart, reload — button vanishes.

That's the canonical end state. Workflows 2 and 3 mirror this shape; the deltas they need will differ (no impersonation for Location Management, for instance) but the steps are the same.

## Known scaffold/Plan-2 naming drift

The scaffold names the API file `user_lookup_api.rb` (workflow-based), but Plan 2 named it `users_api.rb` (resource-based). Both work because the Grape mount in `base.rb` references the class name (`HelmApi::V1::UsersApi`), not the file name. Pick one convention per workflow.

Same for `scope:` keys in `check_permission!` — the scaffold defaults to `scope: { id: params[:id] }` while Plan 2 uses the more semantic `scope: { human_id: params[:id] }`. For now the YAML backend ignores scope contents (Plan 1 §3.2), so this is cosmetic — but when the AuthZ backend swaps in, you'll want the semantic name.
