import { api } from "./api";

export type UserSummary = { id: number; email: string; full_name: string };

export type Membership = {
  company_id: number;
  company_name: string;
  location_id: number | null;
  location_name: string | null;
  role_at_location: string;
  since: string | null;
};

export type UserJob = {
  id: number;
  title: string;
  status: string;
  location_id: number | null;
  location_name: string | null;
  scheduled_for: string | null;
};

export type UserDetail = {
  id: number;
  email: string;
  full_name: string;
  created_at: string;
  last_sign_in_at: string | null;
  stytch_subject: string | null;
  mfa_status: string | null;
  bank_account_present: boolean;
  memberships: Membership[];
  jobs: UserJob[];
  phone?: string;
  ssn_last4?: string;
  bank_last4?: string;
  _redacted: string[];
};

export type VerificationResult        = { sent_at: string; provider_request_id: string };
export type EmailVerificationResult   = { sent_at: string; provider_request_id: string; to_email: string };
export type ImpersonationToken        = { url: string; expires_at: string };
export type UserEditAttrs             = { email?: string; phone?: string; full_name?: string };

export const usersApi = {
  search: (q: string) => api.get<UserSummary[]>(`/helm_api/v1/users?q=${encodeURIComponent(q)}`),
  show:   (id: number | string) => api.get<UserDetail>(`/helm_api/v1/users/${id}`),
  update: (id: number | string, attrs: UserEditAttrs) => api.patch<UserDetail>(`/helm_api/v1/users/${id}`, attrs),
  verifySms:   (id: number | string) => api.post<VerificationResult>(`/helm_api/v1/users/${id}/verification_sms`),
  verifyEmail: (id: number | string) => api.post<EmailVerificationResult>(`/helm_api/v1/users/${id}/verification_email`),
  impersonate: (id: number | string) => api.post<ImpersonationToken>(`/helm_api/v1/users/${id}/impersonate`),
};
