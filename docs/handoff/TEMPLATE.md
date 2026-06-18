# Migrating a workflow into Helm — checklist

Read `docs/handoff/user_lookup.md` first — it's the worked example. This file is the bare checklist
you copy into a per-workflow handoff doc.

## 1. Scaffold

```bash
scripts/scaffold-workflow.rb <workflow_snake> <resource_snake>
```

Writes Helm-side skeletons under `app/`, `client-helm/src/`, and `spec/`. Drops HB1-side
find/replace templates under `tmp/hb1-out/<workflow>/`. Also mounts the new API class in
`app/api/helm_api/v1/base.rb` — verify this happened after running the scaffold.

## 2. Decide the writes

For each "this admin can do X to a <resource>" verb (e.g. `verify_phone`, `change_tier`,
`archive_jobs`), you'll add:

- An HB1 service object under `app/services/<pack>/<resources>/<verb>.rb`
- An HB1 Grape POST route under `app/api/rpa_api/v1/<resources>_api.rb`
- A `Hb1Client::<Resources>.<verb>` method in the Helm repo
- A `post :<verb> do ... end` block in `app/api/helm_api/v1/<workflow>_api.rb`
- A React button + onClick wired to the new endpoint, gated by `usePermission("...")`

## 3. Permissions

Edit `config/permissions.yml`:

- Add new permission keys under the `permissions:` list (use `<domain>.<verb>_<resource>` form).
- Assign each new key to the roles that should hold it.
- Restart Rails. No code change needed for permission moves.

### Adding or changing roles

CS-facing roles (`cs_*`) require approval from a CS Tier 4 leader before the PR merges.
Engineering roles (`eng_*`) require approval from an Eng lead.
Open a PR against `config/permissions.yml` and tag the approver in the PR description.

### Reloading permissions

`config/permissions.yml` is loaded at app boot by `PermissionService::YamlBackend`. To pick up
changes you must restart Rails (`bin/rails restart` or redeploy). There is no live-reload.

## 4. PII

In `app/api/entities/<resource>.rb`:

- Decide whether any field is PII. See `docs/PII.md` for the definition and field list.
- Add PII field names to the `PII_FIELDS` constant.
- For each, add an `expose(:field)` line inside a `with_options(if: ...)` block gated on
  `opts[:role]&.can?("account.view_pii")`. (See `app/api/entities/user.rb`.)
- Add a spec asserting the field is absent for `cs_t1_agent` and present for `cs_t2_payroll`.

## 5. Audit

Every write must call `AuditService.record`. Required fields:

```ruby
AuditService.record(
  actor:         admin_user,           # from lookup_admin_user!
  workflow:      "workflow_snake",     # e.g. "user_lookup"
  action:        "resource.past_verb", # see naming convention below
  resource_type: "ModelName",          # e.g. "User", "Company", "Location"
  resource_id:   params[:id],
  payload_before: { field: old_value },  # only for updates; nil for creates/deletes
  payload_after:  { field: new_value }
)
```

### Action naming convention

Format: `<resource_snake>.<past_tense_verb>`

| Good | Bad |
|------|-----|
| `user.edited` | `user.edit`, `user.update_user` |
| `company.billing_tier_changed` | `company.tier_change`, `billing_tier_updated` |
| `location.jobs_archived` | `location.archive`, `jobs.archived` |
| `location.user_impersonated` | `user.impersonated_from_location` |

Use the resource the audit row is attached to as the prefix, not the resource being acted on.
(Example: impersonating a user from the Location workflow → `location.user_impersonated`,
attached to `resource_type: "Location"`, `resource_id: location_id`.)

### Payload shape requirements

- **For field edits** (`user.edited`, `company.billing_tier_changed`): include only the fields
  that changed. Shape: `{ field_name: old_value }` for `payload_before`, `{ field_name: new_value }`
  for `payload_after`. Use strings or scalars — no nested objects.
- **For actions** (`user.verification_sms_sent`, `location.jobs_archived`): use only
  `payload_after`. Include enough to reconstruct what happened: counts, timestamps, IDs.
- **Avoid embedding large blobs** in payloads. Link by ID, don't copy data.
- **PII in payloads:** phone numbers and emails may appear in `payload_before`/`payload_after`
  for `user.edited` events. These must be anonymised on GDPR deletion (see `docs/PII.md`).

## 6. Scope key naming convention

When calling `check_permission!`, the scope hash key must match the YAML `scope:` type:

| permissions.yml `scope:` | Code scope key | Example |
|--------------------------|---------------|---------|
| `human` | `human_id` | `scope: { human_id: params[:id] }` |
| `company` | `company_id` | `scope: { company_id: params[:id] }` |
| `location` | `location_id` | `scope: { location_id: params[:id] }` |
| `object` (custom) | `<resource>_id` | `scope: { invoice_id: params[:id] }` |
| collection-level check | `{}` | `scope: {}` (list/search endpoints) |

The YamlBackend ignores scope values today, but AuthZ will use them for row-level access control.
Using wrong keys now means a silent break when AuthZ swaps in.

## 7. Wire the routes

- `app/api/helm_api/v1/base.rb` — the scaffold adds `mount HelmApi::V1::<...>Api` automatically.
  Verify it's there before proceeding. If it's missing, add it manually inside the `Base` class.
- `client-helm/src/App.tsx` — add nav `<Button>` and `<Route path=".../">`

## 8. Tests (four required per workflow)

1. **Permission test** — add rows to `spec/services/permission_service_spec.rb` for any new roles × keys.
2. **Entity PII test** — in `spec/entities/<resource>_spec.rb`, assert PII absence/presence flips with role.
3. **Endpoint integration test** — in `spec/requests/<workflow>_spec.rb`, stub HB1 via WebMock, assert
   permission 403s, the success path 200s, and audit row count went up by 1.
4. **Audit test** — usually folded into #3 with `.to change(AuditEvent, :count).by(1)`.

## 9. Datadog

Anything high-sensitivity (impersonation, billing change, mass delete) should `Datadog::Statsd.increment`
with a counter so we can dashboard + alert on it. (See `app/services/audit_service.rb` for the lograge
+ statsd pattern that's already established.)

## 10. HB1

Hand `tmp/hb1-out/<workflow>/*.template` to the HB1 owner. They follow the Strangler Fig pattern:
extract service from `app/admin/<resource>.rb` → add Grape route that calls it → admin action body
becomes a one-line `Service.call(...)`.

Full contract: `docs/HB1-CONTRACT.md`.
Reference for Workflow 1 (worked example): `docs/handoff/hb1-workflow1-user-lookup.md`.

## 11. Demo it

`bin/dev` boots Rails (:3001) + Vite (:5173) + stub HB1 (:9999) via `Procfile.dev`.
Browse `localhost:5173`. Use the RoleSwitcher to flip into a role that has and a role that
doesn't have each permission. Watch the buttons appear/disappear and the audit tab fill.

To restart the stub HB1 if it dies:

```bash
ruby bin/stub-hb1 &
```

The stub runs on port 9999. Rails must have `HB1_API_BASE_URL=http://localhost:9999` (default in `.env.example`).
