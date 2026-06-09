import { useState, useMemo, useEffect } from "react";
import { Link as RouterLink } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Box, List, ListItemButton, ListItemText, TextField, Typography, CircularProgress } from "@mui/material";
import { locationsApi, LocationSummary } from "../../lib/locations";

function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return debounced;
}

export function LocationManagementIndexPage() {
  const [q, setQ] = useState("");
  const debounced = useDebounced(q, 250);

  const { data, isFetching } = useQuery({
    queryKey: ["locations", "search", debounced],
    queryFn: () => locationsApi.search(debounced),
    enabled: debounced.length >= 1,
  });

  const results = useMemo(() => data ?? [], [data]);

  return (
    <Box>
      <Typography variant="h5" gutterBottom>LocationManagement</Typography>
      <TextField label="Search" value={q} onChange={(e) => setQ(e.target.value)} fullWidth autoFocus />
      <Box mt={2}>
        {isFetching && <CircularProgress size={20} />}
        {!isFetching && debounced.length >= 1 && results.length === 0 && (
          <Typography color="text.secondary">No results.</Typography>
        )}
        <List>
          {results.map((r: LocationSummary) => (
            <ListItemButton key={r.id} component={RouterLink} to={`/locations/${r.id}`}>
              <ListItemText primary={r.name} secondary={`#${r.id}`} />
            </ListItemButton>
          ))}
        </List>
      </Box>
    </Box>
  );
}
