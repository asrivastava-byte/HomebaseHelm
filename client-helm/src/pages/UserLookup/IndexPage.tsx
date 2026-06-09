import { useState, useMemo, useEffect } from "react";
import { Link as RouterLink } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Box, List, ListItemButton, ListItemText, TextField, Typography, CircularProgress } from "@mui/material";
import { usersApi, UserSummary } from "../../lib/users";

function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return debounced;
}

export function UserLookupIndexPage() {
  const [q, setQ] = useState("");
  const debounced = useDebounced(q, 250);

  const { data, isFetching } = useQuery({
    queryKey: ["users", "search", debounced],
    queryFn: () => usersApi.search(debounced),
    enabled: debounced.length >= 1,
  });

  const results = useMemo(() => data ?? [], [data]);

  return (
    <Box>
      <Typography variant="h5" gutterBottom>User lookup</Typography>
      <TextField
        label="Search by email, phone, or id"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        fullWidth
        autoFocus
      />
      <Box mt={2}>
        {isFetching && <CircularProgress size={20} />}
        {!isFetching && debounced.length >= 1 && results.length === 0 && (
          <Typography color="text.secondary">No results.</Typography>
        )}
        <List>
          {results.map((u: UserSummary) => (
            <ListItemButton key={u.id} component={RouterLink} to={`/users/${u.id}`}>
              <ListItemText primary={u.email} secondary={u.full_name} />
            </ListItemButton>
          ))}
        </List>
      </Box>
    </Box>
  );
}
