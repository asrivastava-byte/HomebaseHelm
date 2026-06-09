# Helm Workflow 3 — Location Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Demo the Location Management workflow (13.8% of admin traffic): search/show a location, archive its jobs via a one-shot button with confirm, audit the count. Built by running `scripts/scaffold-workflow.rb location_management location` first, then filling in two small deltas. Completes the MVP's three-workflow coverage.

**Architecture:** Same shape as Workflow 1 and 2. The simplifying differences: (a) no PII fields — location data is non-sensitive (`PII_FIELDS = []` and `_redacted` always `[]`); (b) one write action (`archive_jobs`) returning `{ archived_job_count, archived_at }` — no before/after pair needed; (c) audit row records the count for forensics.

**Tech Stack:** No new gems or packages.

**Plan dependencies:**
- `helm-workflow2-v1-helm-only` — scaffold bug fix in place; second workflow proves the toolkit works.

**Repo layout this plan touches:**

```
~/Homebase1/                                                   (skipped — handoff doc only)
  app/services/locations/archive_jobs_service.rb               ← extract from app/admin/locations
  app/api/rpa_api/v1/locations_api.rb                          ← new file (1 GET + 1 POST)

~/helm/helm/
  app/api/entities/location.rb                                 ← scaffold writes (no extension needed)
  app/api/entities/archive_jobs_result.rb                      ← new
  app/api/helm_api/v1/locations_api.rb                         ← scaffold writes, extend with post :archive_jobs
  app/api/helm_api/v1/base.rb                                  ← mount LocationsApi
  app/services/hb1_client/locations.rb                         ← scaffold writes, extend with .archive_jobs
  spec/entities/archive_jobs_result_spec.rb                    ← new
  spec/requests/location_management_spec.rb                    ← scaffold writes, extend with archive route + audit
  spec/services/hb1_client/locations_spec.rb                   ← scaffold writes, extend
  client-helm/src/lib/locations.ts                             ← scaffold writes, extend
  client-helm/src/pages/LocationManagement/                    ← scaffold writes index/show
    IndexPage.tsx                                              ← scaffold (no edits)
    ShowPage.tsx                                               ← extend to add ArchiveJobsButton
    ArchiveJobsButton.tsx                                      ← new
    {IndexPage,ShowPage,ArchiveJobsButton}.test.tsx
  client-helm/src/App.tsx                                      ← add /locations route + nav
  docs/handoff/
    location_management.md                                     ← scaffold writes
    hb1-workflow3-location-management.md                       ← new
```

**Contract between HB1 and Helm:**

```
GET  /api/rpa_api/v1/locations/:id
  → { id, name, company_id, address, timezone, archived_at, created_at }

GET  /api/rpa_api/v1/locations?q=<query>
  → [{ id, name, company_id }, ...]   # ≤ 25 results

POST /api/rpa_api/v1/locations/:id/archive_jobs
  → { archived_job_count: 17, archived_at: "2026-06-09T17:00:00Z" }
```

---

## Section A — HB1 changes (skipped — handoff doc only)

### Task A0: Write the HB1 handoff doc

**Files:**
- Create: `docs/handoff/hb1-workflow3-location-management.md`

- [ ] **Step 1: Create the doc**

Create `docs/handoff/hb1-workflow3-location-management.md` with sections mirroring `docs/handoff/hb1-workflow1-user-lookup.md` and `hb1-workflow2-company-merchant.md`:

- TL;DR: extract `Locations::ArchiveJobsService` from `app/admin/locations` action body; add `app/api/rpa_api/v1/locations_api.rb` with GET + POST routes.
- Orient: `grep -nr "archive.*job" app/admin/locations*.rb`.
- Service: `Locations::ArchiveJobsService.call(location:)` → `Struct(:archived_job_count, :archived_at)`. Atomic: count then archive.
- Grape: `resource :locations do; get; route_param :id do; get; post :archive_jobs do; ... end end end`.
- Smoke: `curl -X POST .../locations/1/archive_jobs`.

- [ ] **Step 2: Commit**

```bash
git add docs/handoff/hb1-workflow3-location-management.md
git commit -m "docs(handoff): HB1 changes required for Workflow 3 (Location Management)"
```

---

## Section B — Run the scaffold + extend BFF

### Task B1: Run the scaffold

- [ ] **Step 1: Run**

```bash
cd ~/helm/helm
scripts/scaffold-workflow.rb location_management location
```

Expected: files written under `app/`, `client-helm/`, `spec/`, `docs/`, `tmp/hb1-out/`. `config/permissions.yml` not modified (`account.view_location` already exists).

- [ ] **Step 2: Mount the API in `base.rb`**

In `app/api/helm_api/v1/base.rb`, add to the mounts list:

```ruby
      mount HelmApi::V1::LocationsApi
```

- [ ] **Step 3: Run the scaffold's baseline specs**

```bash
bundle exec rspec spec/entities/location_spec.rb \
                  spec/requests/location_management_spec.rb \
                  spec/services/hb1_client/locations_spec.rb
```

Expected: all pass (show + search).

- [ ] **Step 4: Commit**

```bash
git add app/ spec/ client-helm/src/lib/locations.ts client-helm/src/pages/LocationManagement/ \
        docs/handoff/location_management.md tmp/hb1-out/location_management/
git commit -m "feat(helm): scaffold workflow 3 (location_management/location) + mount LocationsApi"
```

### Task B2: `Hb1Client::Locations.archive_jobs`

**Files:**
- Modify: `app/services/hb1_client/locations.rb`
- Modify: `spec/services/hb1_client/locations_spec.rb`

- [ ] **Step 1: Append failing spec**

Append to `spec/services/hb1_client/locations_spec.rb`:

```ruby
  describe ".archive_jobs" do
    it "POSTs and returns archived_job_count + archived_at" do
      stub_request(:post, "https://hb1.test/api/rpa_api/v1/locations/42/archive_jobs")
        .to_return(status: 201,
                   body: { archived_job_count: 17, archived_at: "2026-06-09T17:00:00Z" }.to_json,
                   headers: { "Content-Type" => "application/json" })
      expect(described_class.archive_jobs(42))
        .to eq("archived_job_count" => 17, "archived_at" => "2026-06-09T17:00:00Z")
    end
  end
```

- [ ] **Step 2: Run — should fail**

```bash
bundle exec rspec spec/services/hb1_client/locations_spec.rb
```

Expected: `undefined method 'archive_jobs'`.

- [ ] **Step 3: Add the method**

In `app/services/hb1_client/locations.rb`, before the closing `end` of the class, add:

```ruby
    def self.archive_jobs(id)
      Base.post("/api/rpa_api/v1/locations/#{id}/archive_jobs")
    end
```

- [ ] **Step 4: Run — should pass**

```bash
bundle exec rspec spec/services/hb1_client/locations_spec.rb
```

Expected: 3 examples (scaffold's 2 + 1 new), 0 failures.

- [ ] **Step 5: Commit**

```bash
git add app/services/hb1_client/locations.rb spec/services/hb1_client/locations_spec.rb
git commit -m "feat(helm): Hb1Client::Locations.archive_jobs"
```

### Task B3: `Entities::ArchiveJobsResult`

**Files:**
- Create: `app/api/entities/archive_jobs_result.rb`
- Create: `spec/entities/archive_jobs_result_spec.rb`

- [ ] **Step 1: Write failing spec**

Create `spec/entities/archive_jobs_result_spec.rb`:

```ruby
require "rails_helper"

RSpec.describe Entities::ArchiveJobsResult do
  it "exposes archived_job_count + archived_at" do
    json = described_class.represent(
      { "archived_job_count" => 17, "archived_at" => "2026-06-09T17:00:00Z" }
    ).serializable_hash
    expect(json).to eq(archived_job_count: 17, archived_at: "2026-06-09T17:00:00Z")
  end
end
```

- [ ] **Step 2: Run — should fail**

```bash
bundle exec rspec spec/entities/archive_jobs_result_spec.rb
```

Expected: `uninitialized constant`.

- [ ] **Step 3: Implement**

Create `app/api/entities/archive_jobs_result.rb`:

```ruby
module Entities
  class ArchiveJobsResult < Grape::Entity
    expose(:archived_job_count) { |obj| obj["archived_job_count"] || obj[:archived_job_count] }
    expose(:archived_at)        { |obj| obj["archived_at"]        || obj[:archived_at] }
  end
end
```

- [ ] **Step 4: Run — should pass**

```bash
bundle exec rspec spec/entities/archive_jobs_result_spec.rb
```

Expected: 1 example, 0 failures.

- [ ] **Step 5: Commit**

```bash
git add app/api/entities/archive_jobs_result.rb spec/entities/archive_jobs_result_spec.rb
git commit -m "feat(helm): ArchiveJobsResult entity"
```

### Task B4: `LocationsApi.post :archive_jobs` with audit

**Files:**
- Modify: `app/api/helm_api/v1/locations_api.rb`
- Modify: `spec/requests/location_management_spec.rb`

- [ ] **Step 1: Append failing spec**

Append to `spec/requests/location_management_spec.rb`:

```ruby
  describe "POST /helm_api/v1/locations/:id/archive_jobs" do
    let(:hb1_result) { { "archived_job_count" => 17, "archived_at" => "2026-06-09T17:00:00Z" } }

    before do
      AdminUser.find_or_create_by!(email: "eng_super@helm.local") do |u|
        u.full_name = "Eng Super"; u.role = "eng_super"
      end
    end

    it "403s for cs_t1_agent (lacks archive_location_jobs)" do
      post "#{base}/42/archive_jobs", headers: { "Cookie" => "HELM_DEMO_ROLE=cs_t1_agent" }
      expect(response).to have_http_status(403)
    end

    it "200s for eng_super and writes one audit event with archived_job_count" do
      stub_request(:post, "https://hb1.test/api/rpa_api/v1/locations/42/archive_jobs")
        .to_return(status: 201, body: hb1_result.to_json,
                   headers: { "Content-Type" => "application/json" })

      expect {
        post "#{base}/42/archive_jobs", headers: { "Cookie" => "HELM_DEMO_ROLE=eng_super" }
      }.to change(AuditEvent, :count).by(1)

      expect(response).to have_http_status(:ok).or have_http_status(:created)
      body = JSON.parse(response.body)
      expect(body).to eq("archived_job_count" => 17, "archived_at" => "2026-06-09T17:00:00Z")

      event = AuditEvent.last
      expect(event.action).to        eq("location.jobs_archived")
      expect(event.payload_after).to eq("archived_job_count" => 17, "archived_at" => "2026-06-09T17:00:00Z")
    end
  end
```

- [ ] **Step 2: Run — should fail (no route)**

```bash
bundle exec rspec spec/requests/location_management_spec.rb
```

Expected: 404s on archive_jobs.

- [ ] **Step 3: Extend `LocationsApi`**

In `app/api/helm_api/v1/locations_api.rb`, inside `route_param :id, type: Integer do`, after the `get` block, add:

```ruby
          post :archive_jobs do
            check_permission!("account.archive_location_jobs", scope: { location_id: params[:id] })
            result = Hb1Client::Locations.archive_jobs(params[:id])
            AuditService.record(
              actor:         lookup_admin_user!,
              workflow:      "location_management",
              action:        "location.jobs_archived",
              resource_type: "Location",
              resource_id:   params[:id],
              payload_after: {
                archived_job_count: result["archived_job_count"],
                archived_at:        result["archived_at"]
              }
            )
            present result, with: Entities::ArchiveJobsResult
          end
```

- [ ] **Step 4: Run — should pass**

```bash
bundle exec rspec spec/requests/location_management_spec.rb
```

Expected: 4 examples (scaffold's 2 + 2 new), 0 failures.

- [ ] **Step 5: Full backend suite**

```bash
bundle exec rspec
```

Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add app/api/helm_api/v1/locations_api.rb spec/requests/location_management_spec.rb
git commit -m "feat(helm): LocationsApi.archive_jobs with audit"
```

---

## Section C — Helm React

### Task C1: Extend `lib/locations.ts`

**Files:**
- Modify: `client-helm/src/lib/locations.ts`

- [ ] **Step 1: Replace the scaffold's `locations.ts`**

Replace `client-helm/src/lib/locations.ts` with:

```ts
import { api } from "./api";

export type LocationSummary = { id: number; name: string };

export type LocationDetail = {
  id: number;
  name: string;
  created_at: string;
  _redacted: string[];
};

export type ArchiveJobsResult = { archived_job_count: number; archived_at: string };

export const locationsApi = {
  search: (q: string) => api.get<LocationSummary[]>(`/helm_api/v1/locations?q=${encodeURIComponent(q)}`),
  show:   (id: number | string) => api.get<LocationDetail>(`/helm_api/v1/locations/${id}`),
  archiveJobs: (id: number | string) => api.post<ArchiveJobsResult>(`/helm_api/v1/locations/${id}/archive_jobs`),
};
```

- [ ] **Step 2: Build**

```bash
cd client-helm && bun run build
```

Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
cd ~/helm/helm
git add client-helm/src/lib/locations.ts
git commit -m "feat(helm-client): locations.ts adds ArchiveJobsResult + archiveJobs"
```

### Task C2: `ArchiveJobsButton` (confirm-style button, not a full modal)

**Files:**
- Create: `client-helm/src/pages/LocationManagement/ArchiveJobsButton.tsx`
- Create: `client-helm/src/pages/LocationManagement/ArchiveJobsButton.test.tsx`

- [ ] **Step 1: Write failing spec**

Create `client-helm/src/pages/LocationManagement/ArchiveJobsButton.test.tsx`:

```tsx
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ArchiveJobsButton } from "./ArchiveJobsButton";

function wrap(ui: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{ui}</QueryClientProvider>;
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
  vi.stubGlobal("confirm", vi.fn(() => true));
});

describe("ArchiveJobsButton", () => {
  it("calls archive endpoint and reports result on confirm", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ archived_job_count: 17, archived_at: "2026-06-09T17:00:00Z" }),
    } as Response);

    const onSuccess = vi.fn();
    render(wrap(<ArchiveJobsButton locationId={42} onSuccess={onSuccess} />));
    fireEvent.click(screen.getByRole("button", { name: /archive jobs/i }));

    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
    expect(onSuccess.mock.calls[0][0]).toMatchObject({ archived_job_count: 17 });
  });

  it("does NOT call fetch if confirm is cancelled", () => {
    (confirm as ReturnType<typeof vi.fn>).mockReturnValueOnce(false);
    render(wrap(<ArchiveJobsButton locationId={42} onSuccess={() => {}} />));
    fireEvent.click(screen.getByRole("button", { name: /archive jobs/i }));
    expect(fetch).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Implement**

Create `client-helm/src/pages/LocationManagement/ArchiveJobsButton.tsx`:

```tsx
import { Button } from "@mui/material";
import { useMutation } from "@tanstack/react-query";
import { locationsApi, ArchiveJobsResult } from "../../lib/locations";

type Props = {
  locationId: number;
  onSuccess: (result: ArchiveJobsResult) => void;
};

export function ArchiveJobsButton({ locationId, onSuccess }: Props) {
  const mutation = useMutation({
    mutationFn: () => locationsApi.archiveJobs(locationId),
    onSuccess,
  });

  const handleClick = () => {
    if (!window.confirm(`Archive all jobs for location #${locationId}? This cannot be undone.`)) return;
    mutation.mutate();
  };

  return (
    <Button variant="contained" color="warning" disabled={mutation.isPending} onClick={handleClick}>
      Archive jobs
    </Button>
  );
}
```

- [ ] **Step 3: Run spec**

```bash
cd client-helm && bun run test src/pages/LocationManagement/ArchiveJobsButton.test.tsx
```

Expected: 2 tests pass.

- [ ] **Step 4: Don't commit yet — wait for C3 since ShowPage imports the button**

### Task C3: ShowPage extension + nav route

**Files:**
- Modify: `client-helm/src/pages/LocationManagement/ShowPage.tsx`
- Modify: `client-helm/src/pages/LocationManagement/ShowPage.test.tsx`
- Modify: `client-helm/src/App.tsx`

- [ ] **Step 1: Replace ShowPage spec**

Replace `client-helm/src/pages/LocationManagement/ShowPage.test.tsx` with:

```tsx
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { PermissionContext } from "../../lib/permissions";
import { LocationManagementShowPage } from "./ShowPage";

function wrap(ui: React.ReactNode, role: string, permissions: string[]) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={client}>
      <PermissionContext.Provider value={{ role, permissions, available_roles: [] }}>
        <MemoryRouter initialEntries={["/locations/42"]}>
          <Routes>
            <Route path="/locations/:id" element={ui} />
          </Routes>
        </MemoryRouter>
      </PermissionContext.Provider>
    </QueryClientProvider>
  );
}

const detail = { id: 42, name: "Main Street", created_at: "2026-06-09T00:00:00Z", _redacted: [] };

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});

describe("LocationManagementShowPage", () => {
  it("renders the location name", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, json: async () => detail } as Response);
    render(wrap(<LocationManagementShowPage />, "cs_t1_agent", ["account.view_location"]));
    await waitFor(() => expect(screen.getByText("Main Street")).toBeInTheDocument());
  });

  it("hides Archive jobs for cs_t1_agent", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, json: async () => detail } as Response);
    render(wrap(<LocationManagementShowPage />, "cs_t1_agent", ["account.view_location"]));
    await waitFor(() => expect(screen.getByText("Main Street")).toBeInTheDocument());
    expect(screen.queryByRole("button", { name: /archive jobs/i })).not.toBeInTheDocument();
  });

  it("shows Archive jobs for eng_super", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, json: async () => detail } as Response);
    render(wrap(<LocationManagementShowPage />, "eng_super",
      ["account.view_location", "account.archive_location_jobs"]));
    await waitFor(() => expect(screen.getByText("Main Street")).toBeInTheDocument());
    expect(screen.getByRole("button", { name: /archive jobs/i })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Rewrite ShowPage to add the button + snackbar**

Replace `client-helm/src/pages/LocationManagement/ShowPage.tsx` with:

```tsx
import { useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Box, Card, CardContent, CircularProgress, Divider, Snackbar, Stack, Tab, Tabs, Typography
} from "@mui/material";
import { useState } from "react";
import { locationsApi } from "../../lib/locations";
import { usePermission } from "../../lib/permissions";
import { AuditTrailTab } from "../../components/AuditTrailTab";
import { ArchiveJobsButton } from "./ArchiveJobsButton";

export function LocationManagementShowPage() {
  const { id } = useParams<{ id: string }>();
  const locationId = Number(id);
  const qc = useQueryClient();
  const [tab, setTab] = useState<"profile" | "audit">("profile");
  const [snack, setSnack] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["locations", locationId],
    queryFn: () => locationsApi.show(locationId),
  });

  const canArchive = usePermission("account.archive_location_jobs");

  if (isLoading || !data) return <CircularProgress />;

  return (
    <Box>
      <Typography variant="h5">{data.name}</Typography>
      <Typography color="text.secondary">#{data.id}</Typography>

      <Stack direction="row" spacing={2} mt={2}>
        {canArchive && (
          <ArchiveJobsButton
            locationId={locationId}
            onSuccess={(r) => {
              setSnack(`Archived ${r.archived_job_count} jobs`);
              qc.invalidateQueries({ queryKey: ["audits", "Location", locationId] });
            }}
          />
        )}
      </Stack>

      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mt: 3 }}>
        <Tab value="profile" label="Profile" />
        <Tab value="audit"   label="Audit trail" />
      </Tabs>
      <Divider />

      {tab === "profile" && (
        <Card sx={{ mt: 2 }}>
          <CardContent>
            <Stack direction="row" spacing={2} py={0.5}>
              <Typography sx={{ width: 160 }} color="text.secondary">Created at</Typography>
              <Typography>{data.created_at}</Typography>
            </Stack>
          </CardContent>
        </Card>
      )}

      {tab === "audit" && <AuditTrailTab resourceType="Location" resourceId={locationId} />}

      <Snackbar open={!!snack} onClose={() => setSnack(null)} message={snack ?? ""} autoHideDuration={4000} />
    </Box>
  );
}
```

- [ ] **Step 3: Run page specs**

```bash
cd client-helm && bun run test src/pages/LocationManagement
```

Expected: 3 ShowPage + 2 ArchiveJobsButton + 1 IndexPage = 6 tests pass.

- [ ] **Step 4: Add the route + nav in `App.tsx`**

In `client-helm/src/App.tsx`:
- Add import: `import { LocationManagementIndexPage } from "./pages/LocationManagement/IndexPage";` and `import { LocationManagementShowPage } from "./pages/LocationManagement/ShowPage";`
- Add nav `<Button component={RouterLink} to="/locations" size="small">Locations</Button>` alongside the existing buttons
- Add routes:
  ```tsx
  <Route path="/locations"     element={<LocationManagementIndexPage />} />
  <Route path="/locations/:id" element={<LocationManagementShowPage />} />
  ```

- [ ] **Step 5: Build + full frontend suite**

```bash
bun run build && bun run test
```

Expected: build exits 0; all tests pass.

- [ ] **Step 6: Commit C2+C3 together**

```bash
cd ~/helm/helm
git add client-helm/src/pages/LocationManagement/ client-helm/src/App.tsx
git commit -m "feat(helm-client): LocationManagement ShowPage + ArchiveJobsButton + nav route"
```

---

## Task FINAL: Smoke + README + tag

- [ ] **Step 1: Full backend + frontend suites**

```bash
cd ~/helm/helm && bundle exec rspec
cd ~/helm/helm/client-helm && bun run test
```

Expected: all green.

- [ ] **Step 2: README workflow status**

Update `README.md` workflow table row 3:

```markdown
| 3 | Location         | Built (Helm side). Live demo blocked on HB1 — see [hb1 handoff](docs/handoff/hb1-workflow3-location-management.md). |
```

- [ ] **Step 3: Tag**

```bash
git add README.md
git commit -m "docs(helm): mark Workflow 3 as built (Helm side) — MVP feature-complete"
git tag helm-workflow3-v1-helm-only
git tag helm-mvp-v1
```

---

## Done with Plan 5

- The MVP's three workflows are all built (Helm side). Tag `helm-mvp-v1` marks the milestone.
- The scaffold + worked example were used twice in real workflows (Plans 4 and 5); the only scaffold bug surfaced was the file/class naming mismatch fixed mid-Plan-4.
- HB1 work is captured in three handoff docs ready for the respective pack teams to execute.
- The plan itself is the shortest of the three workflow plans (1 entity, 1 client method, 1 BFF route, 1 React component) — proof that the scaffold is doing its job.
