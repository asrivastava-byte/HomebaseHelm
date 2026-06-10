import { api } from "./api";

export type LocationSummary = { id: number; name: string };

export type LocationUser = {
  id: number;
  name: string;
  email: string;
  role_at_location: string;
};

export type LocationDetail = {
  id: number;
  name: string;
  company_id: number;
  address: string;
  tier: string;
  partner_name: string;
  job_count: number;
  archived_job_count: number;
  created_at: string;
  users: LocationUser[];
  _redacted: string[];
};

export type ArchiveJobsResult   = { archived_job_count: number; archived_at: string };
export type UnarchiveJobsResult = { unarchived_job_count: number; unarchived_at: string };
export type ImpersonationToken  = { url: string; expires_at: string };

export const locationsApi = {
  search: (q: string) => api.get<LocationSummary[]>(`/helm_api/v1/locations?q=${encodeURIComponent(q)}`),
  show:   (id: number | string) => api.get<LocationDetail>(`/helm_api/v1/locations/${id}`),
  archiveJobs:   (id: number | string) => api.post<ArchiveJobsResult>(`/helm_api/v1/locations/${id}/archive_jobs`),
  unarchiveJobs: (id: number | string) => api.post<UnarchiveJobsResult>(`/helm_api/v1/locations/${id}/unarchive_jobs`),
  impersonateUserAt: (locationId: number | string, userId: number) =>
    api.post<ImpersonationToken>(`/helm_api/v1/locations/${locationId}/impersonate?user_id=${userId}`),
};
