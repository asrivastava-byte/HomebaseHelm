import { api } from "./api";

export type CompanySummary = { id: number; name: string; tier: string };

export type CompanyDetail = {
  id: number;
  name: string;
  tier: string;
  owner_user_id: number;
  created_at: string;
  stripe_customer_id?: string;
  _redacted: string[];
};

export type MerchantProfile = {
  tier: string;
  billing_state: string;
  subscription_started_at: string;
  subscription_renews_at: string;
  check_entity_id: number | null;
  payment_method?: { last4: string; brand: string };
  recent_invoices: Array<{ id: number; amount_cents: number; status: string; paid_at: string }>;
  _redacted: string[];
};

export type BillingTierChange = { from_tier: string; to_tier: string; effective_at: string };

export const companiesApi = {
  search:           (q: string) => api.get<CompanySummary[]>(`/helm_api/v1/companies?q=${encodeURIComponent(q)}`),
  show:             (id: number | string) => api.get<CompanyDetail>(`/helm_api/v1/companies/${id}`),
  merchantProfile:  (id: number | string) => api.get<MerchantProfile>(`/helm_api/v1/companies/${id}/merchant_profile`),
  changeTier:       (id: number | string, to_tier: string) =>
    api.post<BillingTierChange>(`/helm_api/v1/companies/${id}/billing_tier`, { to_tier }),
};
