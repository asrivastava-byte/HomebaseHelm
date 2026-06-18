# HB1 REST Contract

Helm calls HB1 over REST using a bearer token. This document is the authoritative contract:
the exact request/response shape Helm expects. HB1 owners must match this contract exactly.
Helm's WebMock stubs in `spec/support/` are authoritative for field names and types.

## Authentication

All requests carry:
```
Authorization: Bearer <HB1_API_TOKEN>
```

The token is provisioned as a long-lived API token on the HB1 side (see `docs/PRODUCTION.md`
§ "How to obtain HB1_API_TOKEN"). All endpoints live under `/api/rpa_api/v1/`.

## Error contract

| HTTP status | When |
|-------------|------|
| 200 | Success |
| 404 | Resource not found |
| 422 | Validation failure — body: `{ "errors": { "<field>": ["<message>"] } }` |
| 500 | HB1 internal error — Helm returns 502 to the browser |

Helm does not retry on 5xx. Transient HB1 errors surface as Helm 502s.

---

## Users

### GET /api/rpa_api/v1/users?q=:query

Search users by name or email. Returns up to 25 results.

**Response:**
```json
[
  {
    "id": 42,
    "email": "jane@example.com",
    "full_name": "Jane Smith"
  }
]
```

### GET /api/rpa_api/v1/users/:id

Returns full user profile.

**Response:**
```json
{
  "id": 42,
  "email": "jane@example.com",
  "full_name": "Jane Smith",
  "phone": "+14155551234",
  "ssn_last4": "6789",
  "bank_last4": "4321",
  "mfa_enabled": true,
  "has_bank_account": true,
  "created_at": "2023-01-15T10:00:00Z",
  "last_sign_in_at": "2024-06-01T08:30:00Z",
  "stytch_subject": "user-live-abc123",
  "memberships": [
    {
      "company_id": 99,
      "company_name": "Acme Diner",
      "location_id": 42,
      "location_name": "Acme — Downtown",
      "role": "manager",
      "started_at": "2022-03-01T00:00:00Z"
    }
  ],
  "upcoming_jobs": [
    {
      "id": 1001,
      "title": "Line Cook",
      "status": "scheduled",
      "scheduled_at": "2024-06-15T09:00:00Z",
      "location_name": "Acme — Downtown"
    }
  ]
}
```

### PATCH /api/rpa_api/v1/users/:id

Update editable fields. At least one field required.

**Request body (all optional, at least one required):**
```json
{
  "email": "new@example.com",
  "phone": "+14155559999",
  "full_name": "Jane M. Smith"
}
```

**Response:** same shape as `GET /users/:id` with updated values.

### POST /api/rpa_api/v1/users/:id/verification_sms

Send a phone verification SMS.

**Request body:** empty `{}`

**Response:**
```json
{
  "sent_at": "2024-06-01T12:00:00Z",
  "provider_request_id": "SM_abc123xyz"
}
```

### POST /api/rpa_api/v1/users/:id/verification_email

Resend account verification email.

**Request body:** empty `{}`

**Response:**
```json
{
  "sent_at": "2024-06-01T12:00:00Z",
  "provider_request_id": "msg_abc123xyz",
  "to_email": "jane@example.com"
}
```

### POST /api/rpa_api/v1/users/:id/impersonation_token

Mint a one-time impersonation URL. Token expires after 15 minutes.

**Request body:** empty `{}`

**Response:**
```json
{
  "url": "https://app.homebase.com/impersonate/login?token=one-time-token-abc",
  "expires_at": "2024-06-01T12:15:00Z"
}
```

---

## Companies

### GET /api/rpa_api/v1/companies?q=:query

Search companies by name. Returns up to 25 results.

**Response:**
```json
[
  {
    "id": 99,
    "name": "Acme Diner",
    "tier": "professional"
  }
]
```

### GET /api/rpa_api/v1/companies/:id

**Response:**
```json
{
  "id": 99,
  "name": "Acme Diner",
  "tier": "professional",
  "subscription_status": "active",
  "subscription_renewal_at": "2024-12-01T00:00:00Z",
  "stripe_customer_id": "cus_abc123",
  "locations": [
    { "id": 42, "name": "Acme — Downtown" },
    { "id": 77, "name": "Acme — Uptown" }
  ],
  "recent_payment_attempts": [
    {
      "id": 501,
      "amount_cents": 9900,
      "status": "succeeded",
      "attempted_at": "2024-05-01T10:00:00Z",
      "failure_reason": null
    }
  ]
}
```

### GET /api/rpa_api/v1/companies/:id/merchant_profile

**Response:**
```json
{
  "company_id": 99,
  "payroll_ready": false,
  "missing_fields": ["bank_account", "ein"],
  "check_entity_id": "chk_entity_abc",
  "recent_invoices": [
    {
      "id": 201,
      "amount_cents": 49500,
      "status": "paid",
      "issued_at": "2024-05-15T00:00:00Z"
    }
  ]
}
```

### GET /api/rpa_api/v1/companies/:id/sales_tax

**Response:**
```json
{
  "company_id": 99,
  "locations": [
    {
      "location_id": 42,
      "location_name": "Acme — Downtown",
      "tax_authority": "CA Board of Equalization",
      "tax_rate_pct": 9.25,
      "exemptions": ["food_for_resale"],
      "total_collected_cents": 124500
    }
  ]
}
```

### GET /api/rpa_api/v1/companies/:id/biller

**Response:**
```json
{
  "company_id": 99,
  "credit_cards": [
    {
      "id": 301,
      "brand": "Visa",
      "last4": "4242",
      "exp_month": 12,
      "exp_year": 2026,
      "is_default": true
    }
  ],
  "tier_history": [
    {
      "tier": "starter",
      "effective_at": "2022-01-01T00:00:00Z"
    },
    {
      "tier": "professional",
      "effective_at": "2023-06-01T00:00:00Z"
    }
  ]
}
```

### POST /api/rpa_api/v1/companies/:id/billing_tier

Change the company's subscription tier.

**Request body:**
```json
{ "to_tier": "professional" }
```

Valid tier values: `"starter"`, `"essentials"`, `"plus"`, `"professional"`.

**Response:**
```json
{
  "company_id": 99,
  "from_tier": "starter",
  "to_tier": "professional",
  "effective_at": "2024-06-01T15:30:00Z"
}
```

---

## Locations

### GET /api/rpa_api/v1/locations?q=:query

Search locations by name. Returns up to 25 results.

**Response:**
```json
[
  {
    "id": 42,
    "name": "Acme — Downtown",
    "company_name": "Acme Diner"
  }
]
```

### GET /api/rpa_api/v1/locations/:id

**Response:**
```json
{
  "id": 42,
  "name": "Acme — Downtown",
  "company_id": 99,
  "company_name": "Acme Diner",
  "address": "123 Main St, San Francisco, CA 94105",
  "tier": "professional",
  "pos_partner": "Toast",
  "active_job_count": 12,
  "archived_job_count": 5,
  "users": [
    {
      "id": 42,
      "full_name": "Jane Smith",
      "email": "jane@example.com",
      "role": "manager"
    }
  ],
  "upcoming_jobs": [
    {
      "id": 1001,
      "title": "Line Cook",
      "status": "scheduled",
      "scheduled_at": "2024-06-15T09:00:00Z"
    }
  ]
}
```

### POST /api/rpa_api/v1/locations/:id/archive_jobs

Archive all active jobs at this location.

**Request body:** empty `{}`

**Response:**
```json
{
  "archived_job_count": 12,
  "archived_at": "2024-06-01T16:00:00Z"
}
```

### POST /api/rpa_api/v1/locations/:id/unarchive_jobs

Unarchive all archived jobs at this location.

**Request body:** empty `{}`

**Response:**
```json
{
  "unarchived_job_count": 5,
  "unarchived_at": "2024-06-01T16:05:00Z"
}
```

---

## Validating the contract against a running HB1

Once HB1 ships the endpoints, run this smoke-test script from the Helm repo:

```bash
# Set these before running
export HB1_API_BASE_URL=http://localhost:3000
export HB1_API_TOKEN=your-token-here
export USER_ID=1
export COMPANY_ID=1
export LOCATION_ID=1

# Check all required fields are present
ruby -e "
  require 'net/http'
  require 'json'

  base = ENV['HB1_API_BASE_URL']
  token = ENV['HB1_API_TOKEN']

  def get(base, token, path)
    uri = URI('\#{base}/api/rpa_api/v1\#{path}')
    req = Net::HTTP::Get.new(uri)
    req['Authorization'] = \"Bearer \#{token}\"
    Net::HTTP.start(uri.hostname, uri.port) { |h| h.request(req) }
  end

  # User contract check
  r = get(base, token, \"/users/\#{ENV['USER_ID']}\")
  u = JSON.parse(r.body)
  required = %w[id email full_name phone ssn_last4 bank_last4 created_at last_sign_in_at stytch_subject]
  missing = required - u.keys
  puts missing.empty? ? 'User contract: OK' : \"User contract MISSING: \#{missing.join(', ')}\"

  # Company contract check
  r = get(base, token, \"/companies/\#{ENV['COMPANY_ID']}\")
  c = JSON.parse(r.body)
  required = %w[id name tier subscription_status locations recent_payment_attempts]
  missing = required - c.keys
  puts missing.empty? ? 'Company contract: OK' : \"Company contract MISSING: \#{missing.join(', ')}\"

  # Location contract check
  r = get(base, token, \"/locations/\#{ENV['LOCATION_ID']}\")
  l = JSON.parse(r.body)
  required = %w[id name company_id address tier users upcoming_jobs active_job_count]
  missing = required - l.keys
  puts missing.empty? ? 'Location contract: OK' : \"Location contract MISSING: \#{missing.join(', ')}\"
"
```

Expected output: all three lines print `OK`.
