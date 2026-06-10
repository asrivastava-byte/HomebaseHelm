import { Link as RouterLink, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Alert, Box, Button, Card, CardContent, Chip, CircularProgress, Divider,
  Link, Snackbar, Stack, Tab, Tabs, Typography
} from "@mui/material";
import { useState } from "react";
import {
  companiesApi, CompanyLocation, CreditCard, PaymentAttempt,
  SalesTaxExemption, SalesTaxLocationRecord, TierHistoryEntry
} from "../../lib/companies";
import { usePermission } from "../../lib/permissions";
import { PiiField } from "../../components/PiiField";
import { AuditTrailTab } from "../../components/AuditTrailTab";
import { ChangeTierDrawer } from "./ChangeTierDrawer";

type Tab = "company" | "merchant" | "sales_tax" | "biller" | "audit";

export function CompanyMerchantShowPage() {
  const { id } = useParams<{ id: string }>();
  const companyId = Number(id);
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>("company");
  const [snack, setSnack] = useState<string | null>(null);
  const [tierOpen, setTierOpen] = useState(false);

  const canChangeTier  = usePermission("billing.update_subscription_tier");
  const canViewSalesTax = usePermission("account.view_sales_tax");
  const canViewBiller   = usePermission("account.view_biller");

  const { data: company,  isLoading: loadingCompany  } = useQuery({
    queryKey: ["companies", companyId],
    queryFn: () => companiesApi.show(companyId),
  });

  const { data: merchant, isLoading: loadingMerchant } = useQuery({
    queryKey: ["companies", companyId, "merchant"],
    queryFn: () => companiesApi.merchantProfile(companyId),
  });

  const { data: salesTax } = useQuery({
    queryKey: ["companies", companyId, "sales_tax"],
    queryFn: () => companiesApi.salesTax(companyId),
    enabled: canViewSalesTax,
  });

  const { data: biller } = useQuery({
    queryKey: ["companies", companyId, "biller"],
    queryFn: () => companiesApi.biller(companyId),
    enabled: canViewBiller,
  });

  if (loadingCompany || loadingMerchant || !company || !merchant) return <CircularProgress />;

  const payrollColor: "success" | "warning" | "error" | "default" =
    merchant.payroll_readiness === "ready"   ? "success" :
    merchant.payroll_readiness === "blocked" ? "error"   :
    merchant.payroll_readiness               ? "warning" : "default";

  return (
    <Box>
      <Typography variant="h5">{company.name}</Typography>
      <Stack direction="row" spacing={1} alignItems="center" mt={0.5}>
        <Typography color="text.secondary">#{company.id}</Typography>
        <Typography color="text.secondary">·</Typography>
        <Chip size="small" label={`tier: ${company.tier}`} />
        <Chip
          size="small"
          color={payrollColor}
          label={`payroll: ${merchant.payroll_readiness ?? "unknown"}`}
        />
        {merchant.missing_data_flags.length > 0 && (
          <Chip
            size="small"
            color="warning"
            label={`${merchant.missing_data_flags.length} missing`}
          />
        )}
      </Stack>

      <Stack direction="row" spacing={2} mt={2}>
        {canChangeTier && (
          <Button variant="contained" onClick={() => setTierOpen(true)}>Change tier</Button>
        )}
      </Stack>

      <Tabs value={tab} onChange={(_, v) => setTab(v as Tab)} sx={{ mt: 3 }} variant="scrollable">
        <Tab value="company"   label="Company" />
        <Tab value="merchant"  label="Merchant" />
        {canViewSalesTax && <Tab value="sales_tax" label="Sales tax" />}
        {canViewBiller   && <Tab value="biller"    label="Biller" />}
        <Tab value="audit"     label="Audit trail" />
      </Tabs>
      <Divider />

      {tab === "company" && (
        <Stack spacing={2} sx={{ mt: 2 }}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>Identity</Typography>
              <Row label="Owner user">#{company.owner_user_id}</Row>
              <Row label="Stripe customer">
                <PiiField name="stripe_customer_id" value={company.stripe_customer_id} redactedFields={company._redacted} />
              </Row>
              <Row label="Tier">{company.tier}</Row>
              <Row label="Created at">{company.created_at}</Row>
            </CardContent>
          </Card>

          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>Subscription</Typography>
              {company.subscription ? (
                <>
                  <Row label="Status">{company.subscription.status}</Row>
                  <Row label="Started">{company.subscription.started_at}</Row>
                  <Row label="Renews">{company.subscription.renews_at}</Row>
                </>
              ) : <Typography color="text.secondary">No subscription record.</Typography>}
            </CardContent>
          </Card>

          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Locations ({company.locations.length})
              </Typography>
              {company.locations.length === 0
                ? <Typography color="text.secondary">(none)</Typography>
                : <Stack divider={<Divider />}>
                    {company.locations.map((l: CompanyLocation) => (
                      <Stack key={l.id} direction="row" justifyContent="space-between" py={1}>
                        <Link component={RouterLink} to={`/locations/${l.id}`}>{l.name}</Link>
                        <Typography color="text.secondary">#{l.id}</Typography>
                      </Stack>
                    ))}
                  </Stack>
              }
            </CardContent>
          </Card>

          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Recent payment attempts ({company.payment_attempts.length})
              </Typography>
              {company.payment_attempts.length === 0
                ? <Typography color="text.secondary">(none)</Typography>
                : <Stack divider={<Divider />}>
                    {company.payment_attempts.map((p: PaymentAttempt) => (
                      <Stack key={p.id} direction="row" alignItems="center" justifyContent="space-between" py={1}>
                        <Box>
                          <Typography>${(p.amount_cents / 100).toFixed(2)}</Typography>
                          <Typography variant="body2" color="text.secondary">
                            #{p.id} · {new Date(p.attempted_at).toLocaleString()}
                            {p.failure_reason && <> · {p.failure_reason}</>}
                          </Typography>
                        </Box>
                        <Chip
                          size="small"
                          label={p.status}
                          color={p.status === "succeeded" ? "success" : p.status === "failed" ? "error" : "warning"}
                        />
                      </Stack>
                    ))}
                  </Stack>
              }
            </CardContent>
          </Card>
        </Stack>
      )}

      {tab === "merchant" && (
        <Stack spacing={2} sx={{ mt: 2 }}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>Payroll readiness</Typography>
              <Row label="Status">
                <Chip size="small" color={payrollColor} label={merchant.payroll_readiness ?? "unknown"} />
              </Row>
              <Row label="Missing data">
                {merchant.missing_data_flags.length === 0
                  ? <Typography color="text.secondary" component="span">none</Typography>
                  : <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                      {merchant.missing_data_flags.map((f) => (
                        <Chip key={f} size="small" color="warning" label={f} />
                      ))}
                    </Stack>
                }
              </Row>
            </CardContent>
          </Card>

          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>Check entity</Typography>
              {merchant.check_entity ? (
                <>
                  <Row label="Entity name">{merchant.check_entity.name}</Row>
                  <Row label="EIN (last 4)">{merchant.check_entity.ein_last4}</Row>
                  <Row label="Status">
                    <Chip
                      size="small"
                      label={merchant.check_entity.status}
                      color={merchant.check_entity.status === "verified" ? "success" : "warning"}
                    />
                  </Row>
                  <Row label="ID">#{merchant.check_entity.id}</Row>
                </>
              ) : <Typography color="text.secondary">No check entity on file.</Typography>}
            </CardContent>
          </Card>

          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>Billing</Typography>
              <Row label="State">{merchant.billing_state}</Row>
              <Row label="Subscription">{merchant.subscription_started_at} → renews {merchant.subscription_renews_at}</Row>
              <Row label="Payment method">
                {merchant._redacted.includes("payment_method")
                  ? <PiiField name="payment_method" value={null} redactedFields={merchant._redacted} />
                  : merchant.payment_method
                    ? <>{merchant.payment_method.brand} ···· {merchant.payment_method.last4}</>
                    : "—"}
              </Row>
            </CardContent>
          </Card>

          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Recent invoices ({merchant.recent_invoices.length})
              </Typography>
              {merchant.recent_invoices.length === 0
                ? <Typography color="text.secondary">(none)</Typography>
                : <Stack divider={<Divider />}>
                    {merchant.recent_invoices.map((i) => (
                      <Stack key={i.id} direction="row" alignItems="center" justifyContent="space-between" py={1}>
                        <Typography>#{i.id} — ${(i.amount_cents / 100).toFixed(2)}</Typography>
                        <Chip
                          size="small"
                          label={i.status}
                          color={i.status === "paid" ? "success" : "warning"}
                        />
                      </Stack>
                    ))}
                  </Stack>
              }
            </CardContent>
          </Card>
        </Stack>
      )}

      {tab === "sales_tax" && canViewSalesTax && (
        <Stack spacing={2} sx={{ mt: 2 }}>
          {!salesTax ? <CircularProgress /> : (
            <>
              <Card>
                <CardContent>
                  <Typography variant="h6" gutterBottom>Aggregate</Typography>
                  <Row label="Tax collected">${(salesTax.aggregate_tax_collected_cents / 100).toFixed(2)}</Row>
                </CardContent>
              </Card>

              <Card>
                <CardContent>
                  <Typography variant="h6" gutterBottom>
                    Per-location records ({salesTax.per_location.length})
                  </Typography>
                  {salesTax.per_location.length === 0
                    ? <Typography color="text.secondary">(none)</Typography>
                    : <Stack divider={<Divider />}>
                        {salesTax.per_location.map((r: SalesTaxLocationRecord) => (
                          <Stack key={r.location_id} py={1} spacing={0.5}>
                            <Stack direction="row" justifyContent="space-between">
                              <Link component={RouterLink} to={`/locations/${r.location_id}`}>{r.location_name}</Link>
                              {r.exempt && <Chip size="small" color="info" label="exempt" />}
                            </Stack>
                            <Typography variant="body2" color="text.secondary">
                              {r.tax_authority} · {r.tax_id} · last filed {new Date(r.last_filed_at).toLocaleDateString()}
                            </Typography>
                          </Stack>
                        ))}
                      </Stack>
                  }
                </CardContent>
              </Card>

              <Card>
                <CardContent>
                  <Typography variant="h6" gutterBottom>
                    Exemptions ({salesTax.exemptions.length})
                  </Typography>
                  {salesTax.exemptions.length === 0
                    ? <Typography color="text.secondary">No exemptions on file.</Typography>
                    : <Stack divider={<Divider />}>
                        {salesTax.exemptions.map((e: SalesTaxExemption, i: number) => (
                          <Stack key={i} py={1}>
                            <Typography>{e.kind}</Typography>
                            <Typography variant="body2" color="text.secondary">
                              granted {e.granted_at}{e.expires_at && <> · expires {e.expires_at}</>}
                            </Typography>
                          </Stack>
                        ))}
                      </Stack>
                  }
                </CardContent>
              </Card>
            </>
          )}
        </Stack>
      )}

      {tab === "biller" && canViewBiller && (
        <Stack spacing={2} sx={{ mt: 2 }}>
          {!biller ? <CircularProgress /> : (
            <>
              <Card>
                <CardContent>
                  <Typography variant="h6" gutterBottom>
                    Locations ({biller.locations.length})
                  </Typography>
                  {biller.locations.length === 0
                    ? <Typography color="text.secondary">(none)</Typography>
                    : <Stack divider={<Divider />}>
                        {biller.locations.map((l: CompanyLocation) => (
                          <Stack key={l.id} direction="row" justifyContent="space-between" py={1}>
                            <Link component={RouterLink} to={`/locations/${l.id}`}>{l.name}</Link>
                            <Typography color="text.secondary">#{l.id}</Typography>
                          </Stack>
                        ))}
                      </Stack>
                  }
                </CardContent>
              </Card>

              <Card>
                <CardContent>
                  <Typography variant="h6" gutterBottom>Credit cards</Typography>
                  {biller._redacted.includes("credit_cards")
                    ? <Alert severity="info">Credit card details are redacted for your role.</Alert>
                    : !biller.credit_cards || biller.credit_cards.length === 0
                      ? <Typography color="text.secondary">No cards on file.</Typography>
                      : <Stack divider={<Divider />}>
                          {biller.credit_cards.map((c: CreditCard) => (
                            <Stack key={c.last4} direction="row" alignItems="center" justifyContent="space-between" py={1}>
                              <Typography>
                                {c.brand} ···· {c.last4} · exp {String(c.exp_month).padStart(2, "0")}/{c.exp_year}
                              </Typography>
                              {c.primary && <Chip size="small" color="primary" label="primary" />}
                            </Stack>
                          ))}
                        </Stack>
                  }
                </CardContent>
              </Card>

              <Card>
                <CardContent>
                  <Typography variant="h6" gutterBottom>
                    Tier history ({biller.tier_history.length})
                  </Typography>
                  {biller.tier_history.length === 0
                    ? <Typography color="text.secondary">(none)</Typography>
                    : <Stack divider={<Divider />}>
                        {biller.tier_history.map((t: TierHistoryEntry, i: number) => (
                          <Stack key={i} direction="row" alignItems="center" justifyContent="space-between" py={1}>
                            <Typography>{t.tier}</Typography>
                            <Typography variant="body2" color="text.secondary">
                              {t.started_at} → {t.ended_at ?? "current"}
                            </Typography>
                          </Stack>
                        ))}
                      </Stack>
                  }
                </CardContent>
              </Card>
            </>
          )}
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
          qc.invalidateQueries({ queryKey: ["companies", companyId, "biller"] });
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
