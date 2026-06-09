import { Dialog, DialogActions, DialogContent, DialogTitle, Button, Typography } from "@mui/material";
import { useMutation } from "@tanstack/react-query";
import { usersApi } from "../../lib/users";

type Props = {
  open: boolean;
  onClose: () => void;
  userId: number;
  onSuccess: () => void;
};

export function ImpersonateModal({ open, onClose, userId, onSuccess }: Props) {
  const mutation = useMutation({
    mutationFn: () => usersApi.impersonate(userId),
    onSuccess: (data) => {
      window.open(data.url, "_blank");
      onSuccess();
    },
  });

  return (
    <Dialog open={open} onClose={onClose}>
      <DialogTitle>Impersonate user #{userId}?</DialogTitle>
      <DialogContent>
        <Typography>
          This will mint a one-time login URL and open it in a new tab. The action is logged and visible
          on the audit trail. Are you sure?
        </Typography>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          color="warning"
          variant="contained"
          onClick={() => mutation.mutate()}
          disabled={mutation.isPending}
        >
          Confirm
        </Button>
      </DialogActions>
    </Dialog>
  );
}
