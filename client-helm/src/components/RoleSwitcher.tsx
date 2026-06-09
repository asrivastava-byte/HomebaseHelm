import { FormControl, InputLabel, MenuItem, Select } from "@mui/material";
import { useSession } from "../lib/permissions";

export function RoleSwitcher() {
  const { role, available_roles } = useSession();

  const onChange = (next: string) => {
    document.cookie = `HELM_DEMO_ROLE=${next}; path=/; max-age=86400`;
    window.location.reload();
  };

  return (
    <FormControl size="small" sx={{ minWidth: 220 }}>
      <InputLabel>Role</InputLabel>
      <Select
        value={role}
        label="Role"
        onChange={(e) => onChange(e.target.value as string)}
      >
        {available_roles.map((r) => (
          <MenuItem key={r} value={r}>{r}</MenuItem>
        ))}
      </Select>
    </FormControl>
  );
}
