import { api } from "./api";

export type CompanySummary = { id: number; name: string; tier: string };

export type CompanyLocation = { id: number; name: string };

export type Subscription = {
  status: string;
  started_at: string;
  renews_at: string;
};

export type PaymentAttempt = {
  id: number;
  amount_cents: number;
  status: string;
  attempted_at: string;
  failure_reason: string | null;
};

export type CompanyDetail = {
  id: number;
  name: string;
  tier: string;
  owner_user_id: number;
  created_at: string;
  subscription: Subscription | null;
  locations: CompanyLocation[];
  payment_attempts: PaymentAttempt[];
  stripe_customer_id?: string;
  _redacted: string[];
};

export type CheckEntity = {
  id: number;
  name: string;
  ein_last4: string;
  status: string;
};

export type MerchantProfile = {
  tier: string;
  billing_state: string;
  subscription_started_at: string;
  subscription_renews_at: string;
  check_entity_id: number | null;
  check_entity: CheckEntity | null;
  payroll_readiness: string | null;
  missing_data_flags: string[];
  payment_method?: { last4: string; brand: string };
  recent_invoices: Array<{ id: number; amount_cents: number; status: string; paid_at: string }>;
  _redacted: string[];
};

export type SalesTaxLocationRecord = {
  location_id: number;
  location_name: string;
  tax_authority: string;
  tax_id: string;
  exempt: boolean;
  last_filed_at: string;
};

export type SalesTaxExemption = {
  kind: string;
  granted_at: string;
  expires_at: string | null;
};

export type CompanySalesTax = {
  company_id: number;
  aggregate_tax_collected_cents: number;
  per_location: SalesTaxLocationRecord[];
  exemptions: SalesTaxExemption[];
};

export type CreditCard = {
  brand: string;
  last4: string;
  exp_month: number;
  exp_year: number;
  primary: boolean;
};

export type TierHistoryEntry = {
  tier: string;
  started_at: string;
  ended_at: string | null;
};

export type CompanyBiller = {
  company_id: number;
  locations: CompanyLocation[];
  credit_cards?: CreditCard[];
  tier_history: TierHistoryEntry[];
  _redacted: string[];
};

export type BillingTierChange = { from_tier: string; to_tier: string; effective_at: string };

export const companiesApi = {
  search:           (q: string) => api.get<CompanySummary[]>(`/helm_api/v1/companies?q=${encodeURIComponent(q)}`),
  show:             (id: number | string) => api.get<CompanyDetail>(`/helm_api/v1/companies/${id}`),
  merchantProfile:  (id: number | string) => api.get<MerchantProfile>(`/helm_api/v1/companies/${id}/merchant_profile`),
  salesTax:         (id: number | string) => api.get<CompanySalesTax>(`/helm_api/v1/companies/${id}/sales_tax`),
  biller:           (id: number | string) => api.get<CompanyBiller>(`/helm_api/v1/companies/${id}/biller`),
  changeTier:       (id: number | string, to_tier: string) =>
    api.post<BillingTierChange>(`/helm_api/v1/companies/${id}/billing_tier`, { to_tier }),
};
