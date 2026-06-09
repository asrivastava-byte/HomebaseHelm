import { useState } from "react";
import {
  Drawer, Box, Typography, FormControl, InputLabel, Select, MenuItem,
  Stack, Button, Alert
} from "@mui/material";
import { useMutation } from "@tanstack/react-query";
import { companiesApi, BillingTierChange } from "../../lib/companies";

const TIERS = ["starter", "professional", "enterprise"] as const;

type Props = {
  open: boolean;
  onClose: () => void;
  companyId: number;
  currentTier: string;
  onSuccess: (change: BillingTierChange) => void;
};

export function ChangeTierDrawer({ open, onClose, companyId, currentTier, onSuccess }: Props) {
  const [toTier, setToTier] = useState<string>(currentTier);

  const mutation = useMutation({
    mutationFn: () => companiesApi.changeTier(companyId, toTier),
    onSuccess,
  });

  return (
    <Drawer anchor="right" open={open} onClose={onClose}>
      <Box sx={{ width: 360, p: 3 }}>
        <Typography variant="h6" gutterBottom>Change subscription tier</Typography>
        <Typography color="text.secondary" gutterBottom>Company #{companyId}</Typography>

        <Alert severity="info" sx={{ my: 2 }}>
          Current tier: <strong>{currentTier}</strong>
        </Alert>

        <FormControl fullWidth>
          <InputLabel>New tier</InputLabel>
          <Select value={toTier} label="New tier" onChange={(e) => setToTier(e.target.value as string)}>
            {TIERS.map((t) => <MenuItem key={t} value={t}>{t}</MenuItem>)}
          </Select>
        </FormControl>

        {mutation.isError && (
          <Alert severity="error" sx={{ mt: 2 }}>{(mutation.error as Error).message}</Alert>
        )}

        <Stack direction="row" spacing={1} justifyContent="flex-end" sx={{ mt: 3 }}>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="contained"
            disabled={mutation.isPending || toTier === currentTier}
            onClick={() => mutation.mutate()}
          >
            Apply
          </Button>
        </Stack>
      </Box>
    </Drawer>
  );
}
