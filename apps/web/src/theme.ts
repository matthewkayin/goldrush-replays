import { createTheme } from "@mui/material/styles";

// Colors from the previous version of the site.
export const colors = {
  sky: "#728fa1",
  sand: "#f4ecd9",
  maroon: "#7a4d49",
  darkMaroon: "#5e3b39",
  tan: "#e2b398",
  darkTan: "#bf8870",
  brown: "#8f6654",
  offBlack: "#28252d",
  yellow: "#eed19e",
};

export const theme = createTheme({
  palette: {
    primary: { main: colors.maroon, dark: colors.darkMaroon },
    secondary: { main: colors.sky },
    background: { default: colors.tan, paper: colors.sand },
    text: { primary: colors.offBlack },
  },
});
