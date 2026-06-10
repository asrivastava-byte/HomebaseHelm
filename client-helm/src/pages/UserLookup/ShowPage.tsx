import { useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Box, Button, Card, CardContent, Chip, CircularProgress, Divider, Snackbar,
  Stack, Tab, Tabs, Typography
} from "@mui/material";
import { useState } from "react";
import { usersApi, Membership, UserJob } from "../../lib/users";
import { usePermission } from "../../lib/permissions";
import { PiiField } from "../../components/PiiField";
import { AuditTrailTab } from "../../components/AuditTrailTab";
import { ImpersonateModal } from "./ImpersonateModal";
import { EditUserDialog } from "./EditUserDialog";

export function UserLookupShowPage() {
  const { id } = useParams<{ id: string }>();
  const userId = Number(id);
  const qc = useQueryClient();
  const [tab, setTab] = useState<"profile" | "memberships" | "jobs" | "audit">("profile");
  const [snack, setSnack] = useState<string | null>(null);
  const [impOpen,  setImpOpen]  = useState(false);
  const [editOpen, setEditOpen] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["users", userId],
    queryFn: () => usersApi.show(userId),
  });

  const canVerifyPhone = usePermission("account.verify_phone");
  const canVerifyEmail = usePermission("account.resend_verification_email");
  const canEdit        = usePermission("account.edit_user");
  const canImpersonate = usePermission("account.impersonate_user");

  const verifySms = useMutation({
    mutationFn: () => usersApi.verifySms(userId),
    onSuccess: () => {
      setSnack("Verification SMS sent");
      qc.invalidateQueries({ queryKey: ["audits", "User", userId] });
    },
  });

  const verifyEmail = useMutation({
    mutationFn: () => usersApi.verifyEmail(userId),
    onSuccess: (r) => {
      setSnack(`Verification email sent to ${r.to_email}`);
      qc.invalidateQueries({ queryKey: ["audits", "User", userId] });
    },
  });

  if (isLoading || !data) return <CircularProgress />;

  const mfaColor: "success" | "warning" | "default" =
    data.mfa_status === "enabled" ? "success" :
    data.mfa_status === "disabled" ? "warning" : "default";

  return (
    <Box>
      <Typography variant="h5">{data.full_name}</Typography>
      <Stack direction="row" spacing={1} alignItems="center" mt={0.5}>
        <Typography color="text.secondary">{data.email}</Typography>
        <Typography color="text.secondary">·</Typography>
        <Chip size="small" label={`MFA: ${data.mfa_status ?? "unknown"}`} color={mfaColor} />
        <Chip
          size="small"
          label={data.bank_account_present ? "bank ✓" : "no bank"}
          color={data.bank_account_present ? "success" : "default"}
        />
      </Stack>

      <Stack direction="row" spacing={2} mt={2} flexWrap="wrap" useFlexGap>
        {canEdit && (
          <Button variant="outlined" onClick={() => setEditOpen(true)}>
            Edit user
          </Button>
        )}
        {canVerifyPhone && (
          <Button variant="outlined" onClick={() => verifySms.mutate()} disabled={verifySms.isPending}>
            Resend verification SMS
          </Button>
        )}
        {canVerifyEmail && (
          <Button variant="outlined" onClick={() => verifyEmail.mutate()} disabled={verifyEmail.isPending}>
            Resend verification email
          </Button>
        )}
        {canImpersonate && (
          <Button variant="contained" color="warning" onClick={() => setImpOpen(true)}>
            Impersonate
          </Button>
        )}
      </Stack>

      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mt: 3 }}>
        <Tab value="profile"     label="Identity" />
        <Tab value="memberships" label={`Memberships (${data.memberships.length})`} />
        <Tab value="jobs"        label={`Jobs (${data.jobs.length})`} />
        <Tab value="audit"       label="Audit trail" />
      </Tabs>
      <Divider />

      {tab === "profile" && (
        <Card sx={{ mt: 2 }}>
          <CardContent>
            <Row label="Full name">{data.full_name}</Row>
            <Row label="Email">{data.email}</Row>
            <Row label="Phone"        ><PiiField name="phone"      value={data.phone}      redactedFields={data._redacted} /></Row>
            <Row label="SSN (last 4)" ><PiiField name="ssn_last4"  value={data.ssn_last4}  redactedFields={data._redacted} /></Row>
            <Row label="Bank (last 4)"><PiiField name="bank_last4" value={data.bank_last4} redactedFields={data._redacted} /></Row>
            <Row label="Bank on file">{data.bank_account_present ? "Yes" : "No"}</Row>
            <Row label="MFA status">{data.mfa_status ?? "unknown"}</Row>
            <Row label="Stytch subject">{data.stytch_subject ?? ""}</Row>
            <Row label="Created at">{data.created_at}</Row>
            <Row label="Last sign-in">{data.last_sign_in_at ?? "—"}</Row>
          </CardContent>
        </Card>
      )}

      {tab === "memberships" && (
        <Card sx={{ mt: 2 }}>
          <CardContent>
            {data.memberships.length === 0
              ? <Typography color="text.secondary">No memberships.</Typography>
              : <Stack divider={<Divider />}>
                  {data.memberships.map((m: Membership, i: number) => (
                    <Stack key={i} py={1.5} spacing={0.5}>
                      <Typography>
                        <strong>{m.company_name}</strong>
                        {m.location_name && <> — {m.location_name}</>}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        {m.role_at_location}
                        {m.since && <> · since {m.since}</>}
                        {m.company_id && <> · company #{m.company_id}</>}
                        {m.location_id && <> · location #{m.location_id}</>}
                      </Typography>
                    </Stack>
                  ))}
                </Stack>
            }
          </CardContent>
        </Card>
      )}

      {tab === "jobs" && (
        <Card sx={{ mt: 2 }}>
          <CardContent>
            {data.jobs.length === 0
              ? <Typography color="text.secondary">No jobs.</Typography>
              : <Stack divider={<Divider />}>
                  {data.jobs.map((j: UserJob) => (
                    <Stack key={j.id} direction="row" alignItems="center" justifyContent="space-between" py={1.5}>
                      <Box>
                        <Typography>{j.title}</Typography>
                        <Typography variant="body2" color="text.secondary">
                          #{j.id} · {j.location_name ?? "—"}{j.scheduled_for && <> · {new Date(j.scheduled_for).toLocaleString()}</>}
                        </Typography>
                      </Box>
                      <Chip
                        size="small"
                        label={j.status}
                        color={j.status === "active" ? "primary" : j.status === "completed" ? "success" : "default"}
                      />
                    </Stack>
                  ))}
                </Stack>
            }
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

      <EditUserDialog
        open={editOpen}
        onClose={() => setEditOpen(false)}
        user={data}
        onSuccess={(updated) => {
          setEditOpen(false);
          setSnack(`Saved changes to ${updated.email}`);
          qc.setQueryData(["users", userId], updated);
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
