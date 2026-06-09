# LocationManagement workflow

**Status:** Scaffolded by `scripts/scaffold-workflow.rb` on 2026-06-09. Code is a skeleton — fill in writes, audit calls, and React details.

## Required next steps

1. Decide which **PII fields** belong to `Location`. Add their string keys to `PII_FIELDS` in `app/api/entities/location.rb` and add `expose` lines guarded by `with_options(if: ...)`. Mirror `app/api/entities/user.rb`.
2. Decide which **writes** the workflow needs (e.g. `change_tier`, `archive_jobs`). For each:
   - Add a `Hb1Client::Locations.<verb>(...)` method.
   - Add a `post :<verb> do ... end` block in `app/api/helm_api/v1/location_management_api.rb`, calling `check_permission!`, the client, then `AuditService.record`.
   - Add a request spec in `spec/requests/location_management_spec.rb` covering: 403 for a role that can't, 200 for a role that can, audit row created.
3. Decide which **permission keys** are needed beyond `account.view_location`. Add them to `config/permissions.yml` and assign to the roles that should hold them.
4. Mount the new `LocationsApi` in `app/api/helm_api/v1/base.rb`:
   ```ruby
   mount HelmApi::V1::LocationsApi
   ```
5. Add a route + nav link in `client-helm/src/App.tsx`:
   ```tsx
   <Button component={RouterLink} to="/locations" size="small">LocationManagement</Button>
   ...
   <Route path="/locations"     element={<LocationManagementIndexPage />} />
   <Route path="/locations/:id" element={<LocationManagementShowPage />} />
   ```

## Required tests (one of each, mirror Workflow 1)

- `spec/services/permission_service_spec.rb` — already covers role × permission. Add rows if you introduce new permission keys.
- `spec/entities/location_spec.rb` — entity PII gating (when you add PII fields).
- `spec/requests/location_management_spec.rb` — endpoint integration via WebMock.
- `spec/services/hb1_client/locations_spec.rb` — Hb1Client method wrappers.

Plus one Vitest per React page/component.

## HB1 changes

This workflow needs corresponding endpoints on HB1. Use `docs/handoff/hb1-workflow1-user-lookup.md` as the template and adapt for `location`. Specifically:
1. Extract per-action service objects from `app/admin/locations.rb` (HB1 side).
2. Add Grape POST routes under `app/api/rpa_api/v1/locations_api.rb` that call them.
3. Verify `GET /api/rpa_api/v1/locations/:id` exposes the fields Helm's `Entities::Location` consumes.

## Worked example

`docs/handoff/user_lookup.md` shows the fully-fleshed-out version of this template for Workflow 1.
