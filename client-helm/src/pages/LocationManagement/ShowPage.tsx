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
