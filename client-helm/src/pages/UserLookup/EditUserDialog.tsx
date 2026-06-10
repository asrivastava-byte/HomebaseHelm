import { useState } from "react";
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  Button, TextField, Stack, Alert
} from "@mui/material";
import { useMutation } from "@tanstack/react-query";
import { usersApi, UserDetail } from "../../lib/users";

type Props = {
  open: boolean;
  onClose: () => void;
  user: UserDetail;
  onSuccess: (updated: UserDetail) => void;
};

export function EditUserDialog({ open, onClose, user, onSuccess }: Props) {
  const [email,    setEmail]    = useState(user.email);
  const [phone,    setPhone]    = useState(user.phone ?? "");
  const [fullName, setFullName] = useState(user.full_name);

  const mutation = useMutation({
    mutationFn: () => {
      const attrs: { email?: string; phone?: string; full_name?: string } = {};
      if (email     !== user.email)              attrs.email     = email;
      if (phone     !== (user.phone ?? ""))      attrs.phone     = phone;
      if (fullName  !== user.full_name)          attrs.full_name = fullName;
      return usersApi.update(user.id, attrs);
    },
    onSuccess,
  });

  const hasChange =
    email !== user.email ||
    phone !== (user.phone ?? "") ||
    fullName !== user.full_name;

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>Edit user #{user.id}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <TextField
            label="Full name"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            fullWidth
          />
          <TextField
            label="Email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            fullWidth
          />
          <TextField
            label="Phone"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            fullWidth
            helperText={user.phone === undefined ? "Phone is redacted for your role." : ""}
            disabled={user.phone === undefined}
          />
          {mutation.isError && (
            <Alert severity="error">{(mutation.error as Error).message}</Alert>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          variant="contained"
          disabled={!hasChange || mutation.isPending}
          onClick={() => mutation.mutate()}
        >
          Save
        </Button>
      </DialogActions>
    </Dialog>
  );
}
