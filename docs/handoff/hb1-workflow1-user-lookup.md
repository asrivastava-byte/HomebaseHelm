# HB1 changes required for Helm Workflow 1 (User Account Lookup)

**Status:** Pending. Helm has been built against WebMock stubs of these endpoints; live demo against HB1 cannot work until these changes ship.
**Owner:** HB1 / Identity pack team
**Helm side:** Already complete on `helm-workflow1-v1-helm-only` tag (see `~/helm/helm`)

## TL;DR

Add two new POST routes to `app/api/rpa_api/v1/users_api.rb` that call two new service objects extracted from `app/admin/users.rb`. ActiveAdmin keeps working — its actions become thin wrappers around the services.

## Why this is small but load-bearing

Per the [Helm MVP design](../2026-06-09-helm-mvp-design.md) §4.4, every workflow follows the same Strangler-Fig pattern:

1. Extract logic out of the `app/admin/<resource>.rb` member/collection action into a service object.
2. Add a `POST` route under `app/api/rpa_api/v1/<resource>_api.rb` that calls the service.
3. ActiveAdmin still works because its action body becomes one line: `Service.call(...)`.

Once these two services + two routes land for `users`, Helm's `User Account Lookup` workflow goes from "stubbed in tests" to "live end-to-end against HB1." It also establishes the per-pack-team migration template — every future workflow that Helm absorbs follows the same shape.

## Contract Helm expects

```
GET  /api/rpa_api/v1/users/:id
  → { id, email, full_name, phone, ssn_last4, bank_last4,
      created_at, last_sign_in_at, stytch_subject }

GET  /api/rpa_api/v1/users?q=<query>
  → [{ id, email, full_name }, ...]   # ≤ 25 results

POST /api/rpa_api/v1/users/:id/verification_sms
  → { sent_at: "<ISO8601>", provider_request_id: "<string>" }

POST /api/rpa_api/v1/users/:id/impersonation_token
  → { url: "https://hb1.../login_as/...", expires_at: "<ISO8601>" }
```

All requests carry `Authorization: Bearer <RPA_API_TOKEN>` (same auth as existing rpa_api endpoints).

## Tasks (mirrors Section A of the full plan at `docs/superpowers/plans/2026-06-09-helm-workflow1-user-lookup.md`)

### 1. Locate the existing admin actions

```bash
cd ~/Homebase1
grep -n "send_verification_sms\|verification_sms" app/admin/users.rb
grep -n "login_user\|impersonat"                   app/admin/users.rb
grep -rn "current_token_actor\|helpers.*Auth"      app/api/rpa_api/v1/ | head
```

Note the line numbers and the auth-helper name. Both inform the next steps.

### 2. Extract `Identity::Users::SendVerificationSms`

Create `app/services/identity/users/send_verification_sms.rb` with a `Result` struct exposing `sent_at` and `provider_request_id`. Move the existing `send_verification_sms` member_action body into it. Replace the admin action body with `Identity::Users::SendVerificationSms.call(user: resource)`. Spec lives under `spec/services/identity/users/send_verification_sms_spec.rb`.

### 3. Extract `Identity::Users::IssueImpersonationToken`

Create `app/services/identity/users/issue_impersonation_token.rb` with a `Result` struct exposing `url` and `expires_at`. Move the URL-minting logic from the `login_user` (or equivalent impersonation) action. Default TTL 15 minutes. Replace the admin action body with a call to the service, then `redirect_to result.url`.

### 4. Add `POST /api/rpa_api/v1/users/:id/verification_sms`

In `app/api/rpa_api/v1/users_api.rb` add (inside the existing `route_param :id, type: Integer do`):

```ruby
desc "Send phone verification SMS"
post :verification_sms do
  user   = User.find(params[:id])
  result = Identity::Users::SendVerificationSms.call(user: user)
  present(result, with: Entities::VerificationResult)
end
```

Create `app/api/rpa_api/v1/entities/verification_result.rb` with `sent_at` (iso8601) + `provider_request_id`.

### 5. Add `POST /api/rpa_api/v1/users/:id/impersonation_token`

In the same `route_param :id` block:

```ruby
desc "Mint a one-time impersonation URL"
post :impersonation_token do
  user   = User.find(params[:id])
  result = Identity::Users::IssueImpersonationToken.call(user: user, actor: current_token_actor)
  present(result, with: Entities::ImpersonationToken)
end
```

Create `app/api/rpa_api/v1/entities/impersonation_token.rb` with `url` + `expires_at` (iso8601). Use the actual rpa_api auth-helper name in place of `current_token_actor` (from step 1).

### 6. Verify `GET /api/rpa_api/v1/users/:id` exposes the 9 contract keys

```bash
bin/rails server -p 3000 &
curl -s -H "Authorization: Bearer $RPA_API_TOKEN" http://localhost:3000/api/rpa_api/v1/users/1 | jq 'keys'
```

If `phone`, `ssn_last4`, `bank_last4`, `stytch_subject`, or `last_sign_in_at` are missing, add them to `app/api/rpa_api/v1/entities/user.rb`.

## Testing

Each new service gets a unit spec. The new POST routes get request specs in `spec/requests/api/rpa_api/v1/users_api_spec.rb`. ActiveAdmin specs (if any) should keep passing untouched — the admin actions still work because they call the new services.

## Smoke against Helm

Once shipped:

```bash
cd ~/helm/helm && bin/dev          # starts Rails on :3001 + Vite on :5173
cd ~/Homebase1 && bin/rails server # starts HB1 on :3000
```

Set `HB1_API_BASE_URL=http://localhost:3000` and `HB1_API_TOKEN=<rpa_api token>` in `~/helm/helm/.env`. Open `http://localhost:5173`, log in as `cs_t2_escalations`, hit Impersonate. The new tab should open the URL HB1 just minted.

## Reference

Full plan with TDD-bite-sized steps for every task: `~/helm/helm/docs/superpowers/plans/2026-06-09-helm-workflow1-user-lookup.md`, Section A (Tasks A1–A6).
