import { createTheme } from "@mui/material";

// Homebase palette extracted from the marketing dashboard:
//   - Sidebar / dark surface: deep purple #1E0E3E
//   - Primary action / brand:  bright purple #5E2BFF
//   - Accent:                  yellow #FFE94A
//   - Background:              light gray #F7F7F9
//   - Surface:                 white
const HOMEBASE = {
  deepPurple:   "#1E0E3E",
  brightPurple: "#5E2BFF",
  brightPurpleHover: "#4A1ECC",
  accentYellow: "#FFE94A",
  bgLight:      "#F7F7F9",
  textOnDark:   "#FFFFFF",
};

export const homebaseTheme = createTheme({
  palette: {
    mode: "light",
    primary:   { main: HOMEBASE.brightPurple, dark: HOMEBASE.brightPurpleHover, contrastText: "#FFFFFF" },
    secondary: { main: HOMEBASE.deepPurple,   contrastText: "#FFFFFF" },
    background: { default: HOMEBASE.bgLight, paper: "#FFFFFF" },
    text:    { primary: "#1A1230", secondary: "#5C5470" },
    warning: { main: "#FF8A3D" },
    success: { main: "#0AAE6B" },
    info:    { main: HOMEBASE.accentYellow, contrastText: "#1A1230" },
  },
  typography: {
    fontFamily: [
      "-apple-system",
      "BlinkMacSystemFont",
      "Inter",
      "Segoe UI",
      "Helvetica Neue",
      "Arial",
      "sans-serif",
    ].join(","),
    h5: { fontWeight: 700 },
    h6: { fontWeight: 600 },
    button: { fontWeight: 600, textTransform: "none", letterSpacing: 0 },
  },
  shape: { borderRadius: 12 },
  components: {
    MuiAppBar: { styleOverrides: { root: { boxShadow: "none" } } },
    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: { root: { borderRadius: 999, paddingInline: 18 } },
    },
    MuiCard: { styleOverrides: { root: { boxShadow: "0 2px 12px rgba(30, 14, 62, 0.06)" } } },
  },
});

export const homebaseColors = HOMEBASE;
