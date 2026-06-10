import { useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Box, Button, Card, CardContent, Chip, CircularProgress, Divider, Snackbar,
  Stack, Tab, Tabs, Typography
} from "@mui/material";
import { useState } from "react";
import { locationsApi, LocationUser } from "../../lib/locations";
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

  const canArchive     = usePermission("account.archive_location_jobs");
  const canImpersonate = usePermission("account.impersonate_user");

  const unarchive = useMutation({
    mutationFn: () => locationsApi.unarchiveJobs(locationId),
    onSuccess: (r) => {
      setSnack(`Unarchived ${r.unarchived_job_count} jobs`);
      qc.invalidateQueries({ queryKey: ["audits", "Location", locationId] });
      qc.invalidateQueries({ queryKey: ["locations", locationId] });
    },
  });

  const impersonate = useMutation({
    mutationFn: (userId: number) => locationsApi.impersonateUserAt(locationId, userId),
    onSuccess: (t, userId) => {
      window.open(t.url, "_blank");
      setSnack(`Impersonating user #${userId}`);
      qc.invalidateQueries({ queryKey: ["audits", "Location", locationId] });
    },
  });

  if (isLoading || !data) return <CircularProgress />;

  return (
    <Box>
      <Typography variant="h5">{data.name}</Typography>
      <Stack direction="row" spacing={1} alignItems="center" mt={0.5}>
        <Typography color="text.secondary">#{data.id}</Typography>
        <Typography color="text.secondary">·</Typography>
        <Chip size="small" label={`tier: ${data.tier}`} />
        <Chip size="small" label={data.partner_name} color="info" />
      </Stack>

      <Stack direction="row" spacing={2} mt={2}>
        {canArchive && (
          <>
            <ArchiveJobsButton
              locationId={locationId}
              onSuccess={(r) => {
                setSnack(`Archived ${r.archived_job_count} jobs`);
                qc.invalidateQueries({ queryKey: ["audits", "Location", locationId] });
                qc.invalidateQueries({ queryKey: ["locations", locationId] });
              }}
            />
            <Button
              variant="outlined"
              color="warning"
              disabled={unarchive.isPending || data.archived_job_count === 0}
              onClick={() => {
                if (!window.confirm(`Unarchive all ${data.archived_job_count} archived jobs at this location?`)) return;
                unarchive.mutate();
              }}
            >
              Unarchive jobs
            </Button>
          </>
        )}
      </Stack>

      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mt: 3 }}>
        <Tab value="profile" label="Profile" />
        <Tab value="audit"   label="Audit trail" />
      </Tabs>
      <Divider />

      {tab === "profile" && (
        <Stack spacing={2} sx={{ mt: 2 }}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>Location</Typography>
              <Row label="Address">{data.address}</Row>
              <Row label="Company id">{data.company_id}</Row>
              <Row label="Tier">{data.tier}</Row>
              <Row label="Partner">{data.partner_name}</Row>
              <Row label="Active jobs">{data.job_count}</Row>
              <Row label="Archived jobs">{data.archived_job_count}</Row>
              <Row label="Created at">{data.created_at}</Row>
            </CardContent>
          </Card>

          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>Users at this location</Typography>
              {data.users.length === 0 && <Typography color="text.secondary">(none)</Typography>}
              <Stack divider={<Divider />}>
                {data.users.map((u: LocationUser) => (
                  <Stack key={u.id} direction="row" alignItems="center" justifyContent="space-between" py={1.5}>
                    <Box>
                      <Typography>{u.name}</Typography>
                      <Typography variant="body2" color="text.secondary">
                        {u.email} · {u.role_at_location} · #{u.id}
                      </Typography>
                    </Box>
                    {canImpersonate && (
                      <Button
                        size="small"
                        variant="contained"
                        color="warning"
                        disabled={impersonate.isPending}
                        onClick={() => {
                          if (!window.confirm(`Impersonate ${u.name} (${u.email}) at this location?`)) return;
                          impersonate.mutate(u.id);
                        }}
                      >
                        Impersonate
                      </Button>
                    )}
                  </Stack>
                ))}
              </Stack>
            </CardContent>
          </Card>
        </Stack>
      )}

      {tab === "audit" && <AuditTrailTab resourceType="Location" resourceId={locationId} />}

      <Snackbar open={!!snack} onClose={() => setSnack(null)} message={snack ?? ""} autoHideDuration={4000} />
    </Box>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <Stack direction="row" spacing={2} py={0.5} alignItems="baseline">
      <Typography sx={{ width: 160 }} color="text.secondary">{label}</Typography>
      <Box>{children}</Box>
    </Stack>
  );
}
