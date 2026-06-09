import { useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Box, Button, Card, CardContent, CircularProgress, Divider, Snackbar, Stack, Tab, Tabs, Typography
} from "@mui/material";
import { useState } from "react";
import { usersApi } from "../../lib/users";
import { usePermission } from "../../lib/permissions";
import { PiiField } from "../../components/PiiField";
import { AuditTrailTab } from "../../components/AuditTrailTab";
import { ImpersonateModal } from "./ImpersonateModal";

export function UserLookupShowPage() {
  const { id } = useParams<{ id: string }>();
  const userId = Number(id);
  const qc = useQueryClient();
  const [tab, setTab] = useState<"profile" | "audit">("profile");
  const [snack, setSnack] = useState<string | null>(null);
  const [impOpen, setImpOpen] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["users", userId],
    queryFn: () => usersApi.show(userId),
  });

  const canVerify     = usePermission("account.verify_phone");
  const canImpersonate = usePermission("account.impersonate_user");

  const verify = useMutation({
    mutationFn: () => usersApi.verifySms(userId),
    onSuccess: () => {
      setSnack("Verification SMS sent");
      qc.invalidateQueries({ queryKey: ["audits", "User", userId] });
    },
  });

  if (isLoading || !data) return <CircularProgress />;

  return (
    <Box>
      <Typography variant="h5">{data.full_name}</Typography>
      <Typography color="text.secondary">{data.email}</Typography>

      <Stack direction="row" spacing={2} mt={2}>
        {canVerify && (
          <Button variant="outlined" onClick={() => verify.mutate()} disabled={verify.isPending}>
            Verify SMS
          </Button>
        )}
        {canImpersonate && (
          <Button variant="contained" color="warning" onClick={() => setImpOpen(true)}>
            Impersonate
          </Button>
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
            <Row label="Phone"       ><PiiField name="phone"      value={data.phone}      redactedFields={data._redacted} /></Row>
            <Row label="SSN (last 4)"><PiiField name="ssn_last4"  value={data.ssn_last4}  redactedFields={data._redacted} /></Row>
            <Row label="Bank (last 4)"><PiiField name="bank_last4" value={data.bank_last4} redactedFields={data._redacted} /></Row>
            <Row label="Stytch subject">{data.stytch_subject ?? ""}</Row>
            <Row label="Created at">{data.created_at}</Row>
            <Row label="Last sign-in">{data.last_sign_in_at ?? "—"}</Row>
          </CardContent>
        </Card>
      )}

      {tab === "audit" && <AuditTrailTab resourceType="User" resourceId={userId} />}

      <ImpersonateModal
        open={impOpen}
        onClose={() => setImpOpen(false)}
        userId={userId}
        onSuccess={() => {
          setImpOpen(false);
          qc.invalidateQueries({ queryKey: ["audits", "User", userId] });
        }}
      />

      <Snackbar open={!!snack} onClose={() => setSnack(null)} message={snack ?? ""} autoHideDuration={3000} />
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
