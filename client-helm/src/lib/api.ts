export type Session = {
  role: string;
  permissions: string[];
  available_roles: string[];
};

const BASE = "";

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    credentials: "include",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${method} ${path} -> ${res.status}: ${text}`);
  }
  return res.json() as Promise<T>;
}

export const api = {
  get:   <T>(path: string)                 => request<T>("GET",   path),
  post:  <T>(path: string, body?: unknown) => request<T>("POST",  path, body),
  patch: <T>(path: string, body?: unknown) => request<T>("PATCH", path, body),
};

export const fetchSession = () => api.get<Session>("/helm_api/v1/session");
