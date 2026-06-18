# PII Classification Policy

## Definition

A field is PII in Helm's context if it meets **either** of these criteria:

1. **Regulatory PII** — a field regulated by GDPR, CCPA, or Homebase's data classification policy
   (e.g. SSN, bank account numbers, exact phone numbers, government IDs)
2. **Operational PII** — a field that a CS Tier 1 agent does not need to resolve 84% of support
   tickets, but that a bad actor could exploit (e.g. Stripe customer IDs, linked payment methods)

If in doubt, classify as PII and gate it. The cost of over-gating is a minor inconvenience to
senior roles; the cost of under-gating is a data incident.

## Current PII fields by resource

| Resource | Field | Type | Reason |
|----------|-------|------|--------|
| User | `phone` | Regulatory | Direct contact info |
| User | `ssn_last4` | Regulatory | SSN fragment |
| User | `bank_last4` | Regulatory | Bank account fragment |
| Company | `stripe_customer_id` | Operational | Maps to payment method history |
| Company Biller | `credit_cards[].last4` | Regulatory | Payment card fragment |

Permission required to see PII fields: `account.view_pii`

Roles that hold `account.view_pii`: `cs_t2_payroll`, `cs_t2_payments`, `cs_t2_escalations`,
`cs_t4_leadership`, `eng_super`, `eng_power` (see `config/permissions.yml`).

## How PII redaction works

Redaction is **server-side** in the Grape entity layer. PII fields are never sent in the JSON
response to a role that lacks `account.view_pii`. The UI cannot un-redact them via DevTools.

Example (from `app/api/entities/user.rb`):

```ruby
PII_FIELDS = %w[phone ssn_last4 bank_last4].freeze

with_options(if: ->(_, opts) { opts[:role]&.can?("account.view_pii") }) do
  expose :phone
  expose :ssn_last4
  expose :bank_last4
end
```

When a PII field is redacted, it is omitted from the response and listed in `_redacted`:

```json
{
  "id": 42,
  "email": "jane@example.com",
  "full_name": "Jane Smith",
  "_redacted": ["phone", "ssn_last4", "bank_last4"]
}
```

The `_redacted` array tells the frontend which fields exist but were withheld, so it can render
`•••••••` instead of an empty cell.

## Adding PII fields for new workflows

When a new workflow exposes a field that meets either PII criterion above:

1. Add the field to `PII_FIELDS` in `app/api/entities/<resource>.rb`
2. Move its `expose` call inside the `with_options(if: ...)` block
3. Update the PII fields table in this document
4. Add a spec to `spec/entities/<resource>_spec.rb` asserting the field is absent for
   `cs_t1_agent` and present for `cs_t2_payroll` (see existing entity specs for the pattern)

## GDPR / CCPA delete obligations

If a user requests deletion of their data:

1. **HB1 side:** The standard HB1 deletion flow handles the user record and domain data.
2. **Helm side:** `audit_events` rows referencing the deleted user's ID remain but contain
   no raw PII — they log only the admin's action, not the user's data. The `payload_before`
   / `payload_after` fields may contain the email or phone that was changed; these should be
   anonymised in the audit row on deletion:

```ruby
# In your deletion service (HB1 or a future Helm endpoint):
AuditEvent.where(resource_type: "User", resource_id: user_id).find_each do |event|
  sanitized_before = sanitize_pii(event.payload_before)
  sanitized_after  = sanitize_pii(event.payload_after)
  event.update_columns(payload_before: sanitized_before, payload_after: sanitized_after)
end

def sanitize_pii(payload)
  return payload if payload.nil?
  payload.transform_values { |v| "[redacted]" }
end
```

3. `admin_users` rows for the internal admin who performed actions are **not** deleted —
   they are internal employee records, not customer PII.

## Stripe customer ID — settled classification

`stripe_customer_id` is classified as **Operational PII** in Helm. It is gated by
`account.view_pii`. Rationale: the ID itself does not contain card data, but it can be
used to look up full payment history in Stripe. CS Tier 1 agents do not need it to
resolve the majority of support tickets.
