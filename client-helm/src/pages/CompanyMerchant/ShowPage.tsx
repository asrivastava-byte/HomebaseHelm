import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Box, Card, CardContent, CircularProgress, Divider, Stack, Tab, Tabs, Typography } from "@mui/material";
import { useState } from "react";
import { companiesApi } from "../../lib/companies";
import { AuditTrailTab } from "../../components/AuditTrailTab";

export function CompanyMerchantShowPage() {
  const { id } = useParams<{ id: string }>();
  const resourceId = Number(id);
  const [tab, setTab] = useState<"profile" | "audit">("profile");

  const { data, isLoading } = useQuery({
    queryKey: ["companies", resourceId],
    queryFn: () => companiesApi.show(resourceId),
  });

  if (isLoading || !data) return <CircularProgress />;

  return (
    <Box>
      <Typography variant="h5">{data.name}</Typography>

      {/* Per-workflow action buttons gated by usePermission go here. */}

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
            {/* Add fields here — PII fields should render via <PiiField name="..." value={...} redactedFields={data._redacted} /> */}
          </CardContent>
        </Card>
      )}

      {tab === "audit" && <AuditTrailTab resourceType="Company" resourceId={resourceId} />}
    </Box>
  );
}
