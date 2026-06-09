# HB1 changes required for Helm Workflow 2 (Company / Merchant Profile)

**Status:** Pending. Helm has been built against WebMock stubs of these endpoints.
**Owner:** HB1 / Billing pack team
**Helm side:** Tagged `helm-workflow2-v1-helm-only` after Plan 4.

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

```ruby
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
```

Create the two entities under `app/api/rpa_api/v1/entities/`.

### 5. Replace admin action bodies

In `app/admin/biller/*`, the existing tier-change actions should call `Billing::TierChangeService.call(...)`. The presenter file gets a thin wrapper that delegates to `Billing::MerchantProfileService.call(...)` so ActiveAdmin keeps working.

### 6. Smoke

```bash
bin/rails server -p 3000 &
sleep 3
curl -s -H "Authorization: Bearer $RPA_API_TOKEN" http://localhost:3000/api/rpa_api/v1/companies/1/merchant_profile | jq
curl -s -X POST -H "Authorization: Bearer $RPA_API_TOKEN" \
     -H "Content-Type: application/json" \
     -d '{"to_tier":"professional"}' \
     http://localhost:3000/api/rpa_api/v1/companies/1/billing_tier | jq
```

## Reference

Full plan: `~/helm/helm/docs/superpowers/plans/2026-06-09-helm-workflow2-company-merchant.md` Section A.
Worked Workflow 1 example: `~/helm/helm/docs/handoff/hb1-workflow1-user-lookup.md`.
