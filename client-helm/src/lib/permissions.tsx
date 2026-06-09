import { createContext, useContext, ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchSession, Session } from "./api";

const empty: Session = { role: "", permissions: [], available_roles: [] };

export const PermissionContext = createContext<Session>(empty);

export function PermissionProvider({ children }: { children: ReactNode }) {
  const { data, isLoading } = useQuery({ queryKey: ["session"], queryFn: fetchSession });
  if (isLoading || !data) return null;
  return <PermissionContext.Provider value={data}>{children}</PermissionContext.Provider>;
}

export function useSession() {
  return useContext(PermissionContext);
}

export function usePermission(key: string): boolean {
  const { permissions } = useContext(PermissionContext);
  return permissions.some((p) => p === key || (p.endsWith(".*") && key.startsWith(p.slice(0, -1))));
}
