import { api } from "./api";

export type CompanySummary = { id: number; name: string };

export type CompanyDetail = {
  id: number;
  name: string;
  created_at: string;
  _redacted: string[];
};

export const companiesApi = {
  search: (q: string) => api.get<CompanySummary[]>(`/helm_api/v1/companies?q=${encodeURIComponent(q)}`),
  show:   (id: number | string) => api.get<CompanyDetail>(`/helm_api/v1/companies/${id}`),
};
