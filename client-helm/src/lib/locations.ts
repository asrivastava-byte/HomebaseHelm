import { api } from "./api";

export type LocationSummary = { id: number; name: string };

export type LocationDetail = {
  id: number;
  name: string;
  created_at: string;
  _redacted: string[];
};

export type ArchiveJobsResult = { archived_job_count: number; archived_at: string };

export const locationsApi = {
  search: (q: string) => api.get<LocationSummary[]>(`/helm_api/v1/locations?q=${encodeURIComponent(q)}`),
  show:   (id: number | string) => api.get<LocationDetail>(`/helm_api/v1/locations/${id}`),
  archiveJobs: (id: number | string) => api.post<ArchiveJobsResult>(`/helm_api/v1/locations/${id}/archive_jobs`),
};
