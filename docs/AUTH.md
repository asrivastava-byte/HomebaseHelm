# Authentication — Stytch JWT Swap Guide

## How auth works in development

`DemoIdentity` middleware (`app/middleware/demo_identity.rb`) reads the `HELM_DEMO_ROLE` cookie
(set by the RoleSwitcher dropdown in the UI) and synthesises a `PermissionService::Principal`.
It never validates a real identity. It raises at boot in `Rails.env.production?`.

## How auth works in production (target state)

Helm authenticates admins via **Stytch Session Tokens** issued after an Okta SSO login. The
token arrives on every request as a cookie (`stytch_session_token`) or in the
`Authorization: Bearer <token>` header. Helm validates it against the Stytch API and maps the
authenticated subject to an `AdminUser` row plus a role from `config/permissions.yml`.

## The contract that must be preserved

Regardless of auth backend, by the time the Grape endpoint runs,
`env[:helm_principal]` must be a `PermissionService::Principal` with:

| Field | Type | Description |
|-------|------|-------------|
| `id` | Integer | `AdminUser#id` |
| `role` | String | A role key from `config/permissions.yml` (e.g. `"cs_t2_escalations"`) |
| `stytch_subject` | String\|nil | Stytch `subject` claim — used for audit attribution |

Everything downstream (permission checks, audit records, PII redaction) reads only `env[:helm_principal]`.

## Step-by-step swap

### 1. Add the Stytch gem

```ruby
# Gemfile
gem "stytch"
```

```bash
bundle install
```

### 2. Add environment variables

```bash
# .env (or your secrets manager)
STYTCH_PROJECT_ID=project-live-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
STYTCH_SECRET=secret-live-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
STYTCH_ENV=live   # or "test" for staging
```

Get these from the [Stytch dashboard](https://stytch.com/dashboard) → your project → API keys.

### 3. Create the Stytch client initialiser

```ruby
# config/initializers/stytch.rb
STYTCH_CLIENT = Stytch::Client.new(
  project_id: ENV.fetch("STYTCH_PROJECT_ID"),
  secret:     ENV.fetch("STYTCH_SECRET"),
  env:        ENV.fetch("STYTCH_ENV", "live").to_sym
)
```

### 4. Create the StytchIdentity middleware

Create `app/middleware/stytch_identity.rb`:

```ruby
class StytchIdentity
  SESSION_DURATION_MINUTES = 60

  def initialize(app)
    @app = app
  end

  def call(env)
    token = extract_token(env)

    if token.nil?
      return [401, { "Content-Type" => "application/json" },
              ['{"error":"unauthenticated","reason":"no session token"}']]
    end

    response = STYTCH_CLIENT.sessions.authenticate(
      session_token:            token,
      session_duration_minutes: SESSION_DURATION_MINUTES
    )

    unless response["status_code"] == 200
      return [401, { "Content-Type" => "application/json" },
              ['{"error":"unauthenticated","reason":"invalid or expired session"}']]
    end

    stytch_user = response["user"]
    subject     = stytch_user["user_id"]
    email       = stytch_user.dig("emails", 0, "email")

    admin = AdminUser.find_or_initialize_by(stytch_subject: subject)
    if admin.new_record?
      # First login: provision with lowest-privilege role.
      # CS/Eng leads then assign the correct role in config/permissions.yml.
      admin.assign_attributes(email: email, full_name: email, role: "cs_t1_agent")
      admin.save!
      Rails.logger.warn("[stytch_identity] provisioned new admin #{email} with cs_t1_agent — assign correct role")
    end

    env[:helm_principal] = PermissionService::Principal.new(
      id:              admin.id,
      role:            admin.role,
      stytch_subject:  subject
    )

    CurrentRequest.ip         = env["REMOTE_ADDR"]
    CurrentRequest.request_id = env["HTTP_X_REQUEST_ID"] || SecureRandom.uuid

    @app.call(env)
  rescue Stytch::Error => e
    Rails.logger.error("[stytch_identity] Stytch error: #{e.message}")
    [503, { "Content-Type" => "application/json" },
     ['{"error":"auth_unavailable","reason":"Stytch service error"}']]
  ensure
    CurrentRequest.reset!
  end

  private

  def extract_token(env)
    # Prefer Authorization header
    auth = env["HTTP_AUTHORIZATION"]
    return Regexp.last_match(1) if auth&.match(/\ABearer (.+)\z/)

    # Fall back to cookie
    parse_cookie(env, "stytch_session_token")
  end

  def parse_cookie(env, name)
    header = env["HTTP_COOKIE"]
    return nil if header.nil? || header.empty?

    header.split(/;\s*/).each do |pair|
      k, v = pair.split("=", 2)
      return URI.decode_www_form_component(v) if k.strip == name
    end
    nil
  end
end
```

### 5. Swap the middleware in config/application.rb

Find the line that inserts `DemoIdentity` (search for `config.middleware.use DemoIdentity`) and replace it:

```ruby
# Before
config.middleware.use DemoIdentity

# After
if Rails.env.development? || Rails.env.test?
  config.middleware.use DemoIdentity
else
  config.middleware.use StytchIdentity
end
```

### 6. Remove the RoleSwitcher from production builds

The `RoleSwitcher` React component writes the `HELM_DEMO_ROLE` cookie. It should not render in production.

In `client-helm/src/App.tsx`, find `<RoleSwitcher />` and wrap it:

```tsx
{import.meta.env.DEV && <RoleSwitcher />}
```

### 7. Set role for provisioned admins

When a new Stytch user logs in, `StytchIdentity` creates an `AdminUser` with role `cs_t1_agent`.
A CS Tier 4 leader or eng lead must then update the role in the database:

```bash
bin/rails console
AdminUser.find_by(email: "new.admin@homebase.com").update!(role: "cs_t2_escalations")
```

Or, if you want the role managed entirely in YAML (future state), add a `stytch_subject → role` mapping
section to `config/permissions.yml` and update `YamlBackend` to read it.

### 8. Smoke-test the swap

```bash
# Start Rails in production mode locally (temporary, for testing)
RAILS_ENV=production STYTCH_PROJECT_ID=... STYTCH_SECRET=... bin/rails server -p 3001

# Request without a token — expect 401
curl -s http://localhost:3001/helm_api/v1/session | jq .

# Request with a valid Stytch token — expect 200
curl -s -H "Authorization: Bearer <your-stytch-token>" http://localhost:3001/helm_api/v1/session | jq .
```

## Migration path summary

| Environment | Middleware | Auth source |
|-------------|-----------|-------------|
| `development` | `DemoIdentity` | `HELM_DEMO_ROLE` cookie |
| `test` | `DemoIdentity` | `HELM_DEMO_ROLE` env var (set in spec_helper) |
| `staging` / `production` | `StytchIdentity` | Stytch session token (cookie or Bearer header) |

## What to do if Stytch is down

`StytchIdentity` returns `503` if the Stytch API call raises. Helm becomes inaccessible — by design.
Admin tools should fail closed, not open.

For planned Stytch maintenance, pre-provision long-lived emergency tokens using the Stytch dashboard
(M2M tokens, 24-hour TTL) and distribute them to on-call engineers.
