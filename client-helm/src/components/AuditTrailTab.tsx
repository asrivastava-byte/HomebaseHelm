import { useQuery } from "@tanstack/react-query";
import { List, ListItem, ListItemText, Typography, CircularProgress } from "@mui/material";
import { api } from "../lib/api";

type AuditEvent = {
  id: number;
  action: string;
  role: string;
  occurred_at: string;
  payload_before: Record<string, unknown> | null;
  payload_after:  Record<string, unknown> | null;
};

type Props = { resourceType: string; resourceId: number };

export function AuditTrailTab({ resourceType, resourceId }: Props) {
  const { data, isLoading } = useQuery({
    queryKey: ["audits", resourceType, resourceId],
    queryFn: () =>
      api.get<AuditEvent[]>(
        `/helm_api/v1/audits?resource_type=${encodeURIComponent(resourceType)}&resource_id=${resourceId}`
      ),
  });

  if (isLoading) return <CircularProgress />;
  if (!data || data.length === 0) return <Typography>No audit events yet.</Typography>;

  return (
    <List dense>
      {data.map((e) => (
        <ListItem key={e.id} alignItems="flex-start">
          <ListItemText
            primary={`${e.action} — ${e.role}`}
            secondary={`${new Date(e.occurred_at).toLocaleString()} · ${JSON.stringify(e.payload_after ?? {})}`}
          />
        </ListItem>
      ))}
    </List>
  );
}
