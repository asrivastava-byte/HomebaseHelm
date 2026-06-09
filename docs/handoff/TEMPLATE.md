# Migrating a workflow into Helm — checklist

Read `docs/handoff/user_lookup.md` first — it's the worked example. This file is the bare checklist
you copy into a per-workflow handoff doc.

## 1. Scaffold

```bash
scripts/scaffold-workflow.rb <workflow_snake> <resource_snake>
```

Writes Helm-side skeletons under `app/`, `client-helm/src/`, and `spec/`. Drops HB1-side
find/replace templates under `tmp/hb1-out/<workflow>/`.

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
- Restart Rails. No code review needed for permission moves.

## 4. PII

In `app/api/entities/<resource>.rb`:

- Add the field names that are PII to the `PII_FIELDS` constant.
- For each, add an `expose(:field)` line inside a `with_options(if: ...)` block gated on
  `opts[:role]&.can?("account.view_pii")`. (See `app/api/entities/user.rb`.)

## 5. Audit

Every write must call `AuditService.record` with `workflow:`, `action:` (use `<resource>.<verb>` form),
`resource_type:`, `resource_id:`, and a `payload_after:` Hash describing what changed. The audit row
shows up in the React `AuditTrailTab` automatically.

## 6. Wire the routes

- `app/api/helm_api/v1/base.rb` — add `mount HelmApi::V1::<...>Api`
- `client-helm/src/App.tsx` — add nav `<Button>` and `<Route path=".../">`

## 7. Tests (four required per workflow)

1. **Permission test** — add rows to `spec/services/permission_service_spec.rb` for any new roles × keys.
2. **Entity PII test** — in `spec/entities/<resource>_spec.rb`, assert PII absence/presence flips with role.
3. **Endpoint integration test** — in `spec/requests/<workflow>_spec.rb`, stub HB1 via WebMock, assert
   permission 403s, the success path 200s, and audit row count went up by 1.
4. **Audit test** — usually folded into #3 with `.to change(AuditEvent, :count).by(1)`.

## 8. Datadog

Anything high-sensitivity (impersonation, billing change, mass delete) should `Datadog::Statsd.increment`
with a counter so we can dashboard + alert on it. (See `app/services/audit_service.rb` for the lograge
+ statsd pattern that's already established.)

## 9. HB1

Hand `tmp/hb1-out/<workflow>/*.template` to the HB1 owner. They follow the Strangler Fig pattern:
extract service from `app/admin/<resource>.rb` → add Grape route that calls it → admin action body
becomes a one-line `Service.call(...)`. Reference doc: `docs/handoff/hb1-workflow1-user-lookup.md`.

## 10. Demo it

`bin/dev` boots Rails + Vite. Browse `localhost:5173`. Use the RoleSwitcher to flip into a role
that has and a role that doesn't have each permission. Watch the buttons appear/disappear and
the audit tab fill.
