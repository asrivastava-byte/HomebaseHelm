# Helm

Admin-panel replacement BFF + React UI. Reads from HB1 via REST, applies role-based permissions from
a single YAML file, and audits every write.

## Quick start

```bash
bin/setup        # bundle, db:prepare, seed 9 demo admin_users, bun install
bin/dev          # rails on :3001, vite on :5173 (via foreman + Procfile.dev)
```

Open <http://localhost:5173>.

## Demo role switching

The top-right dropdown writes a `HELM_DEMO_ROLE` cookie. The Rails `DemoIdentity` middleware reads
it on every request and sets `request.env[:helm_principal]`. Production swaps this for Stytch JWT —
the contract (`env[:helm_principal]`) is unchanged.

## Editing permissions

Edit `config/permissions.yml`. Restart Rails. The UI re-reads role permissions on next page load.

## Tests

```bash
bundle exec rspec                  # backend
(cd client-helm && bun run test)   # frontend
```

## Workflows

| # | Workflow         | Status                                                                 |
|---|------------------|------------------------------------------------------------------------|
| 1 | User lookup      | Built (Helm side). Live demo blocked on HB1 changes — see [hb1 handoff](docs/handoff/hb1-workflow1-user-lookup.md). |
| 2 | Company/Merchant | Built (Helm side). Live demo blocked on HB1 — see [hb1 handoff](docs/handoff/hb1-workflow2-company-merchant.md). |
| 3 | Location         | Not started                                                            |

## HB1 dependency

For workflows to work against a real HB1, set `HB1_API_BASE_URL` and `HB1_API_TOKEN` in `.env`
and ship the HB1 changes described in `docs/handoff/hb1-workflow1-user-lookup.md`. Until then,
local development still works — the BFF returns whatever HB1 returns, and request specs use WebMock.

## Scaffolding a new workflow

When a pack team wants to migrate a workflow from ActiveAdmin into Helm:

```bash
scripts/scaffold-workflow.rb <workflow_snake> <resource_snake>
# e.g.
scripts/scaffold-workflow.rb company_merchant company
```

This stamps out entity / Hb1Client / BFF API / React pages / specs / handoff doc, and appends
`account.view_<resource>` to `config/permissions.yml` (idempotently). HB1-side `.template`
files land in `tmp/hb1-out/<workflow>/`.

Then follow `docs/handoff/<workflow>.md`. The fully-worked example lives in `docs/handoff/user_lookup.md`.

## Handoff docs

- `docs/handoff/TEMPLATE.md` — the per-team migration checklist
- `docs/handoff/user_lookup.md` — Workflow 1 worked example
- `docs/handoff/hb1-workflow1-user-lookup.md` — HB1 changes required for Workflow 1

## Plans

See `docs/superpowers/plans/` for the implementation plans.
