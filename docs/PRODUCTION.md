# Production Deployment Runbook

## Prerequisites

| Dependency | Version | Notes |
|-----------|---------|-------|
| Ruby | 3.2+ | See `.ruby-version` |
| PostgreSQL | 14+ | Helm's own DB — do NOT share with HB1 |
| Bun | 1.x | Frontend asset build |
| Foreman (or equivalent) | any | To run `Procfile.dev` locally |

## Environment variables

Set these in your secrets manager (AWS SSM, Vault, etc.) and inject at deploy time.
Never commit real values to the repo. `.env.example` shows the shape.

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | PostgreSQL connection string, e.g. `postgres://helm:password@db:5432/helm_production` |
| `HB1_API_BASE_URL` | Yes | Base URL of the HB1 Rails app, e.g. `https://api.homebase.internal` |
| `HB1_API_TOKEN` | Yes | Bearer token for HB1's `rpa_api`. See below for how to obtain it. |
| `HELM_PERMISSION_BACKEND` | Yes (prod) | Set to `yaml` (default) or `authz` when AuthZ gRPC lands |
| `HELM_CORS_ORIGINS` | Yes | Comma-separated allowed CORS origins, e.g. `https://helm.homebase.internal` |
| `STYTCH_PROJECT_ID` | Yes (prod) | Stytch project ID — from Stytch dashboard |
| `STYTCH_SECRET` | Yes (prod) | Stytch secret — from Stytch dashboard |
| `STYTCH_ENV` | Yes (prod) | `live` for production, `test` for staging |
| `RAILS_ENV` | Yes | Set to `production` |
| `SECRET_KEY_BASE` | Yes | Generate with `bundle exec rails secret` |
| `RAILS_LOG_TO_STDOUT` | Recommended | Set to `1` for Datadog log pickup |
| `DD_API_KEY` | Optional | Datadog API key — tracing no-ops if unset |
| `DD_ENV` | Optional | e.g. `production`, `staging` |
| `HELM_DEMO_ROLE` | **Never in prod** | Dev-only. Ignored by `StytchIdentity` middleware. |

### How to obtain HB1_API_TOKEN

`HB1_API_TOKEN` is a bearer token that grants access to HB1's `rpa_api` endpoints.

1. In the HB1 Rails console: `ApiToken.create!(name: "helm-production", scopes: ["rpa_api"])` (exact model/method may differ — check with the HB1 team).
2. Copy the token value immediately — it is shown only once.
3. Store it in your secrets manager and inject it as `HB1_API_TOKEN`.
4. To rotate: create a new token first, deploy Helm with the new token, then revoke the old one.

## Database setup

Helm's PostgreSQL database contains only two tables: `admin_users` and `audit_events`.
It stores **zero domain data** — users, companies, and locations live in HB1.

```bash
# First deploy
RAILS_ENV=production bundle exec rails db:create db:migrate db:seed

# Subsequent deploys (migrations only)
RAILS_ENV=production bundle exec rails db:migrate
```

The `db:seed` task creates one `AdminUser` row per role (9 rows total) for smoke-testing.
These should be deleted or left as inactive in production.

### Schema change strategy

Helm's schema is intentionally minimal. Before adding a column:
- It must be nullable or have a default (no lock on a large table)
- Migration is run before the new code is deployed (backwards-compatible deploy)
- No `change_column` — add a new column and backfill instead

## Building frontend assets

```bash
cd client-helm && bun install && bun run build
```

The build outputs to `client-helm/dist/`. Rails serves these via `public/` (copy or symlink the
dist directory, or configure your CDN to serve from it).

## Process model

Helm runs two processes:

| Process | Command | Port |
|---------|---------|------|
| Rails BFF | `bundle exec rails server -p 3001` | 3001 |
| Static assets | Served by nginx / CDN from `client-helm/dist/` | — |

In development, Vite runs as a dev server on `:5173`. In production, the frontend is a pre-built
static bundle — no Vite process needed.

## Health check

```bash
curl -s http://localhost:3001/helm_api/v1/session
```

Without a valid session token this returns `401` (or `200` if `DemoIdentity` is still active — which
means the Stytch swap hasn't happened yet and must not go to production).

A `200` with a session token confirms Rails is up, the DB is reachable, and permissions are loaded.

## First-user provisioning

After the Stytch middleware is wired up, the first admin to log in gets `cs_t1_agent` by default.
Assign the correct role via Rails console:

```bash
RAILS_ENV=production bundle exec rails console
AdminUser.find_by(email: "name@homebase.com").update!(role: "cs_t2_escalations")
```

See `docs/AUTH.md` for the full auth setup.

## Monitoring

Audit events are written to both PostgreSQL and stdout as JSON lines. In Datadog:

- **Log source:** `source:rails` — filter on `event:helm.audit` to see all admin actions
- **Alert on impersonation:** `event:helm.audit AND action:user.impersonation_started` — alert if rate spikes
- **Alert on billing changes:** `event:helm.audit AND action:company.billing_tier_changed`
- **Alert on 5xx rate:** `status:error` from the Rails process

No additional instrumentation is needed for MVP — the JSON audit log is the primary signal.

## Scaling

Helm is stateless (session state is in Stytch; admin data is in PostgreSQL). Horizontal scaling is
safe. The only shared state is the PostgreSQL `audit_events` table — it is append-only and handles
high concurrency without locking.

## Rollback

Because Helm writes only `audit_events` and `admin_users` (and never modifies HB1 data), rolling
back a Helm deploy is low-risk:

1. Deploy the previous image/revision
2. Run `db:rollback` only if the current migration is destructive (rare — Helm schema is stable)
3. No HB1 changes are needed

## Disaster recovery

- **DB backup:** Nightly PostgreSQL dump via your standard infra backup. Audit events are
  append-only — point-in-time recovery is low priority, but RPO of 24 hours is acceptable.
- **If Helm DB is lost entirely:** Audit history is gone, but HB1 domain data is unaffected.
  Helm can be rebuilt from scratch; `db:migrate db:seed` restores service in minutes.
- **If HB1 is down:** Helm returns `502` for all data-fetching endpoints. Permission checks
  and the audit trail still work (they hit Helm's own DB). No data loss.
