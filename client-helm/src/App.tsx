import { Box, Button, Stack, Typography } from "@mui/material";
import { Route, Routes, Link as RouterLink, Navigate } from "react-router-dom";
import { PermissionProvider, useSession } from "./lib/permissions";
import { RoleSwitcher } from "./components/RoleSwitcher";
import { UserLookupIndexPage } from "./pages/UserLookup/IndexPage";
import { UserLookupShowPage } from "./pages/UserLookup/ShowPage";
import { CompanyMerchantIndexPage } from "./pages/CompanyMerchant/IndexPage";
import { CompanyMerchantShowPage } from "./pages/CompanyMerchant/ShowPage";

function Header() {
  const { role } = useSession();
  return (
    <Stack direction="row" justifyContent="space-between" alignItems="center" p={2} borderBottom="1px solid #eee">
      <Stack direction="row" spacing={3} alignItems="center">
        <Typography variant="h5">Helm</Typography>
        <Button component={RouterLink} to="/users"     size="small">User lookup</Button>
        <Button component={RouterLink} to="/companies" size="small">Company / Merchant</Button>
      </Stack>
      <Stack direction="row" spacing={2} alignItems="center">
        <Typography color="text.secondary">role: {role}</Typography>
        <RoleSwitcher />
      </Stack>
    </Stack>
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
          </Routes>
        </Box>
      </Box>
    </PermissionProvider>
  );
}
