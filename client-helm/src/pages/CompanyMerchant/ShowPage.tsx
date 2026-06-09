import { useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Box, Button, Card, CardContent, CircularProgress, Divider, Snackbar, Stack, Tab, Tabs, Typography
} from "@mui/material";
import { useState } from "react";
import { companiesApi } from "../../lib/companies";
import { usePermission } from "../../lib/permissions";
import { PiiField } from "../../components/PiiField";
import { AuditTrailTab } from "../../components/AuditTrailTab";
import { ChangeTierDrawer } from "./ChangeTierDrawer";

export function CompanyMerchantShowPage() {
  const { id } = useParams<{ id: string }>();
  const companyId = Number(id);
  const qc = useQueryClient();
  const [tab, setTab] = useState<"profile" | "audit">("profile");
  const [snack, setSnack] = useState<string | null>(null);
  const [tierOpen, setTierOpen] = useState(false);

  const { data: company, isLoading: loadingCompany } = useQuery({
    queryKey: ["companies", companyId],
    queryFn: () => companiesApi.show(companyId),
  });

  const { data: merchant, isLoading: loadingMerchant } = useQuery({
    queryKey: ["companies", companyId, "merchant"],
    queryFn: () => companiesApi.merchantProfile(companyId),
  });

  const canChangeTier = usePermission("billing.update_subscription_tier");

  if (loadingCompany || loadingMerchant || !company || !merchant) return <CircularProgress />;

  return (
    <Box>
      <Typography variant="h5">{company.name}</Typography>
      <Typography color="text.secondary">#{company.id} · tier: {company.tier}</Typography>

      <Stack direction="row" spacing={2} mt={2}>
        {canChangeTier && (
          <Button variant="contained" onClick={() => setTierOpen(true)}>Change tier</Button>
        )}
      </Stack>

      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mt: 3 }}>
        <Tab value="profile" label="Company + Merchant Profile" />
        <Tab value="audit"   label="Audit trail" />
      </Tabs>
      <Divider />

      {tab === "profile" && (
        <Stack spacing={2} sx={{ mt: 2 }}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>Company</Typography>
              <Row label="Owner user">{company.owner_user_id}</Row>
              <Row label="Stripe customer">
                <PiiField name="stripe_customer_id" value={company.stripe_customer_id} redactedFields={company._redacted} />
              </Row>
              <Row label="Created at">{company.created_at}</Row>
            </CardContent>
          </Card>

          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>Merchant profile</Typography>
              <Row label="Billing state">{merchant.billing_state}</Row>
              <Row label="Subscription">
                {merchant.subscription_started_at} → renews {merchant.subscription_renews_at}
              </Row>
              <Row label="Check entity id">{merchant.check_entity_id ?? "—"}</Row>
              <Row label="Payment method">
                {merchant._redacted.includes("payment_method")
                  ? <PiiField name="payment_method" value={null} redactedFields={merchant._redacted} />
                  : merchant.payment_method
                    ? <>{merchant.payment_method.brand} ···· {merchant.payment_method.last4}</>
                    : "—"}
              </Row>
              <Row label="Recent invoices">
                {merchant.recent_invoices.length === 0
                  ? "(none)"
                  : merchant.recent_invoices.map((i) => (
                      <Box key={i.id}>#{i.id} — {(i.amount_cents / 100).toFixed(2)} ({i.status})</Box>
                    ))}
              </Row>
            </CardContent>
          </Card>
        </Stack>
      )}

      {tab === "audit" && <AuditTrailTab resourceType="Company" resourceId={companyId} />}

      <ChangeTierDrawer
        open={tierOpen}
        onClose={() => setTierOpen(false)}
        companyId={companyId}
        currentTier={company.tier}
        onSuccess={(change) => {
          setSnack(`Tier changed: ${change.from_tier} → ${change.to_tier}`);
          setTierOpen(false);
          qc.invalidateQueries({ queryKey: ["companies", companyId] });
          qc.invalidateQueries({ queryKey: ["companies", companyId, "merchant"] });
          qc.invalidateQueries({ queryKey: ["audits", "Company", companyId] });
        }}
      />

      <Snackbar open={!!snack} onClose={() => setSnack(null)} message={snack ?? ""} autoHideDuration={4000} />
    </Box>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <Stack direction="row" spacing={2} py={0.5} alignItems="baseline">
      <Typography sx={{ width: 200 }} color="text.secondary">{label}</Typography>
      <Box>{children}</Box>
    </Stack>
  );
}
