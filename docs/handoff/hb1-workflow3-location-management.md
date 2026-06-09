# HB1 changes required for Helm Workflow 3 (Location Management)

**Status:** Pending. Helm has been built against WebMock stubs of these endpoints.
**Owner:** HB1 / Locations or Hiring pack team
**Helm side:** Tagged `helm-workflow3-v1-helm-only` after Plan 5.

## TL;DR

This is the smallest HB1 lift of the three MVP workflows. One service extraction, one new Grape file with two routes.

1. `GET /api/rpa_api/v1/locations/:id` — new (no existing rpa_api locations endpoint).
2. `GET /api/rpa_api/v1/locations?q=<query>` — new.
3. `POST /api/rpa_api/v1/locations/:id/archive_jobs` — new, calls `Locations::ArchiveJobsService`.

Location data is non-PII, so Helm's entity has no field-level gating.

## Contract Helm expects

```
GET  /api/rpa_api/v1/locations/:id
  → { id, name, company_id, address, timezone, archived_at, created_at }

GET  /api/rpa_api/v1/locations?q=<query>
  → [{ id, name, company_id }, ...]   # ≤ 25 results

POST /api/rpa_api/v1/locations/:id/archive_jobs
  → { archived_job_count: 17, archived_at: "<ISO8601>" }
```

All carry `Authorization: Bearer <RPA_API_TOKEN>`.

## Tasks

### 1. Orient

```bash
cd ~/Homebase1
grep -rn "archive.*job\|jobs.*archiv" app/admin/locations*.rb
grep -rn "current_token_actor" app/api/rpa_api/v1/ | head
```

Note the line numbers and the rpa_api auth-helper name.

### 2. Extract `Locations::ArchiveJobsService`

Create `app/services/locations/archive_jobs_service.rb`. Move the archive logic from the existing `app/admin/locations*.rb` action. Signature: `call(location:)` returning `Struct(:archived_job_count, :archived_at)`. Atomic: count first, archive, return count.

Spec at `spec/services/locations/archive_jobs_service_spec.rb`.

### 3. Create `app/api/rpa_api/v1/locations_api.rb`

```ruby
module RpaApi
  module V1
    class LocationsApi < ::Grape::API
      resource :locations do
        params do
          optional :q, type: String
        end
        get do
          scope = Location.all
          scope = scope.where("name ILIKE ?", "%#{params[:q]}%") if params[:q].present?
          present(scope.limit(25), with: Entities::LocationSummary)
        end

        route_param :id, type: Integer do
          get do
            present(Location.find(params[:id]), with: Entities::Location)
          end

          desc "Archive all jobs at this location"
          post :archive_jobs do
            location = Location.find(params[:id])
            result   = Locations::ArchiveJobsService.call(location: location)
            present(result, with: Entities::ArchiveJobsResult)
          end
        end
      end
    end
  end
end
```

Create three entities under `app/api/rpa_api/v1/entities/`:
- `LocationSummary` (`id`, `name`, `company_id`)
- `Location` (full set: `id`, `name`, `company_id`, `address`, `timezone`, `archived_at`, `created_at`)
- `ArchiveJobsResult` (`archived_job_count`, `archived_at` as ISO8601)

Then mount the new API in your rpa_api base file (wherever `RpaApi::V1::UsersApi` is mounted).

### 4. Replace any existing admin action body

If `app/admin/locations*.rb` has a `member_action :archive_jobs` or similar, replace its body with:

```ruby
Locations::ArchiveJobsService.call(location: resource)
redirect_to admin_location_path(resource), notice: "Jobs archived."
```

ActiveAdmin keeps working; the logic lives in the service.

### 5. Smoke

```bash
bin/rails server -p 3000 &
sleep 3
curl -s -H "Authorization: Bearer $RPA_API_TOKEN" http://localhost:3000/api/rpa_api/v1/locations/1 | jq
curl -s -X POST -H "Authorization: Bearer $RPA_API_TOKEN" \
     http://localhost:3000/api/rpa_api/v1/locations/1/archive_jobs | jq
```

## Reference

Full plan: `~/helm/helm/docs/superpowers/plans/2026-06-09-helm-workflow3-location-management.md` Section A.
Worked Workflow 1 example: `~/helm/helm/docs/handoff/hb1-workflow1-user-lookup.md`.
