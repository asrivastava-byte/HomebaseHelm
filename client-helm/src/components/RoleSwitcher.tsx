import { FormControl, InputLabel, MenuItem, Select } from "@mui/material";
import { useSession } from "../lib/permissions";

export function RoleSwitcher() {
  const { role, available_roles } = useSession();

  const onChange = (next: string) => {
    document.cookie = `HELM_DEMO_ROLE=${next}; path=/; max-age=86400`;
    window.location.reload();
  };

  const onDarkSx = {
    color: "#fff",
    "& .MuiOutlinedInput-notchedOutline": { borderColor: "rgba(255,255,255,0.4)" },
    "&:hover .MuiOutlinedInput-notchedOutline": { borderColor: "rgba(255,255,255,0.7)" },
    "&.Mui-focused .MuiOutlinedInput-notchedOutline": { borderColor: "#fff" },
    "& .MuiSvgIcon-root": { color: "#fff" },
  };

  return (
    <FormControl size="small" sx={{ minWidth: 220 }}>
      <InputLabel
        sx={{
          color: "rgba(255,255,255,0.85)",
          "&.Mui-focused": { color: "#fff" },
        }}
      >
        Role
      </InputLabel>
      <Select
        value={role}
        label="Role"
        onChange={(e) => onChange(e.target.value as string)}
        sx={onDarkSx}
      >
        {available_roles.map((r) => (
          <MenuItem key={r} value={r}>{r}</MenuItem>
        ))}
      </Select>
    </FormControl>
  );
}
