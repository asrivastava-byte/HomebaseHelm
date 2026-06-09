import { api } from "./api";

export type UserSummary = { id: number; email: string; full_name: string };

export type UserDetail = {
  id: number;
  email: string;
  full_name: string;
  created_at: string;
  last_sign_in_at: string | null;
  stytch_subject: string | null;
  phone?: string;
  ssn_last4?: string;
  bank_last4?: string;
  _redacted: string[];
};

export type VerificationResult = { sent_at: string; provider_request_id: string };
export type ImpersonationToken = { url: string; expires_at: string };

export const usersApi = {
  search: (q: string) => api.get<UserSummary[]>(`/helm_api/v1/users?q=${encodeURIComponent(q)}`),
  show:   (id: number | string) => api.get<UserDetail>(`/helm_api/v1/users/${id}`),
  verifySms:   (id: number | string) => api.post<VerificationResult>(`/helm_api/v1/users/${id}/verification_sms`),
  impersonate: (id: number | string) => api.post<ImpersonationToken>(`/helm_api/v1/users/${id}/impersonate`),
};
