import { Box, Button, Stack, Typography } from "@mui/material";
import { Route, Routes, Link as RouterLink, Navigate } from "react-router-dom";
import { PermissionProvider, useSession } from "./lib/permissions";
import { RoleSwitcher } from "./components/RoleSwitcher";
import { UserLookupIndexPage } from "./pages/UserLookup/IndexPage";
import { UserLookupShowPage } from "./pages/UserLookup/ShowPage";
import { CompanyMerchantIndexPage } from "./pages/CompanyMerchant/IndexPage";
import { CompanyMerchantShowPage } from "./pages/CompanyMerchant/ShowPage";
import { LocationManagementIndexPage } from "./pages/LocationManagement/IndexPage";
import { LocationManagementShowPage } from "./pages/LocationManagement/ShowPage";
import { homebaseColors } from "./theme";

function Header() {
  const { role } = useSession();
  return (
    <Stack
      direction="row"
      justifyContent="space-between"
      alignItems="center"
      px={3}
      py={1.5}
      sx={{
        bgcolor: homebaseColors.deepPurple,
        color: homebaseColors.textOnDark,
      }}
    >
      <Stack direction="row" spacing={3} alignItems="center">
        <Stack direction="row" spacing={1.5} alignItems="center">
          <Box
            sx={{
              width: 32,
              height: 32,
              borderRadius: "8px",
              bgcolor: homebaseColors.brightPurple,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontWeight: 800,
              color: "#fff",
              fontSize: 18,
              letterSpacing: -0.5,
            }}
          >
            h
          </Box>
          <Typography variant="h5" sx={{ color: "inherit" }}>Homebase Helm</Typography>
        </Stack>
        <NavLink to="/users">User lookup</NavLink>
        <NavLink to="/companies">Company / Merchant</NavLink>
        <NavLink to="/locations">Locations</NavLink>
      </Stack>
      <Stack direction="row" spacing={2} alignItems="center">
        <Typography sx={{ color: "rgba(255,255,255,0.7)" }}>role: {role}</Typography>
        <RoleSwitcher />
      </Stack>
    </Stack>
  );
}

function NavLink({ to, children }: { to: string; children: React.ReactNode }) {
  return (
    <Button
      component={RouterLink}
      to={to}
      size="small"
      sx={{
        color: "rgba(255,255,255,0.85)",
        "&:hover": { bgcolor: "rgba(255,255,255,0.08)", color: "#fff" },
      }}
    >
      {children}
    </Button>
  );
}

export default function App() {
  return (
    <PermissionProvider>
      <Box>
        <Header />
        <Box p={4}>
          <Routes>
            <Route path="/" element={<Navigate to="/users" replace />} />
            <Route path="/users"          element={<UserLookupIndexPage />} />
            <Route path="/users/:id"      element={<UserLookupShowPage />} />
            <Route path="/companies"      element={<CompanyMerchantIndexPage />} />
            <Route path="/companies/:id"  element={<CompanyMerchantShowPage />} />
            <Route path="/locations"      element={<LocationManagementIndexPage />} />
            <Route path="/locations/:id"  element={<LocationManagementShowPage />} />
          </Routes>
        </Box>
      </Box>
    </PermissionProvider>
  );
}
