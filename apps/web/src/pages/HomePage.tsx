import { Box, Button, Paper, Typography } from "@mui/material";
import { Link as RouterLink } from "react-router";
import { colors } from "../theme.ts";
import { HomeDemoChart } from "./HomeDemoChart.tsx";

// What the match page shows, one card each. Keep these in step with
// pages/match/.
const features = [
  {
    title: "Economy",
    text: "Gold banked, gold mined and income per minute, plus how long each player sat supply blocked.",
  },
  {
    title: "Army",
    text: "Population and army value through the match, and every unit made and lost.",
  },
  {
    title: "Build order",
    text: "A timeline of every building and unit each player started, at the time they started it.",
  },
  {
    title: "Upgrades",
    text: "When each player finished every upgrade, on the same timeline as their build.",
  },
  {
    title: "APM",
    text: "Actions per minute for the whole match and minute by minute.",
  },
  {
    title: "Fights",
    text: "Who killed what: units and buildings taken down, player against player.",
  },
];

const steps = [
  "Create a free account.",
  "Upload your .rep files.",
  "View analytics, and share results with friends.",
];

// The landing page: what the site does and where to start.
export function HomePage() {
  return (
    <Box
      sx={{
        maxWidth: 960,
        mx: "auto",
        mb: 6,
        textAlign: "center",
        display: "flex",
        flexDirection: "column",
        gap: 6,
      }}
    >
      <Hero />
      <HomeDemoChart />
      <Box component="section">
        <Typography variant="h4" component="h2" gutterBottom>
          Every match, broken down
        </Typography>
        <Typography color="text.secondary" sx={{ mb: 3 }}>
          Give yourself picture of each stat that decided your last game
        </Typography>
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: {
              xs: "1fr",
              sm: "1fr 1fr",
              md: "1fr 1fr 1fr",
            },
            gap: 2,
          }}
        >
          {features.map((feature) => (
            <FeatureCard key={feature.title} {...feature} />
          ))}
        </Box>
      </Box>
      <Box component="section">
        <Typography variant="h4" component="h2" sx={{ mb: 3 }}>
          How it works
        </Typography>
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: { xs: "1fr", md: "1fr 1fr 1fr" },
            gap: 3,
          }}
        >
          {steps.map((text, index) => (
            <Step key={text} number={index + 1} text={text} />
          ))}
        </Box>
      </Box>
      <Box component="section">
        <Typography variant="h5" component="h2" gutterBottom>
          Ready to see how your last game went?
        </Typography>
        <CallToAction />
      </Box>
    </Box>
  );
}

function Hero() {
  return (
    <Paper
      elevation={4}
      sx={{
        px: { xs: 3, sm: 6 },
        py: { xs: 5, sm: 8 },
        color: colors.sand,
        background: `linear-gradient(160deg, ${colors.maroon}, ${colors.darkMaroon})`,
        border: `2px solid ${colors.brown}`,
      }}
    >
      <Typography
        variant="h2"
        component="h1"
        sx={{
          color: colors.yellow,
          textShadow: "2px 2px 4px #000b",
          fontSize: { xs: "2.5rem", sm: "3.75rem" },
        }}
        gutterBottom
      >
        Gold Rush Replays
      </Typography>
      <Typography variant="h5" component="p" gutterBottom>
        See how every match was won, or lost.
      </Typography>
      <Typography sx={{ maxWidth: 600, mx: "auto", opacity: 0.9 }}>
        Upload a Gold Rush replay and get a full breakdown of the match in
        moments: economy, army, build order, upgrades, APM and fights.
      </Typography>
    </Paper>
  );
}

// Visitors who click it are sent to sign in first by RequireUser.
function CallToAction({ onDark = false }: { onDark?: boolean }) {
  return (
    <Box
      sx={{
        display: "flex",
        gap: 2,
        justifyContent: "center",
        flexWrap: "wrap",
      }}
    >
      <Button
        variant="contained"
        size="large"
        component={RouterLink}
        to="/upload"
        sx={
          onDark
            ? {
                bgcolor: colors.yellow,
                color: colors.offBlack,
                "&:hover": { bgcolor: colors.sand },
              }
            : undefined
        }
      >
        Upload a replay
      </Button>
    </Box>
  );
}

function FeatureCard({ title, text }: { title: string; text: string }) {
  return (
    <Paper
      sx={{
        p: 3,
        borderTop: `4px solid ${colors.maroon}`,
        transition: "transform 0.15s, box-shadow 0.15s",
        "&:hover": { transform: "translateY(-4px)", boxShadow: 6 },
      }}
    >
      <Typography
        variant="h6"
        component="h3"
        sx={{ color: colors.maroon }}
        gutterBottom
      >
        {title}
      </Typography>
      <Typography variant="body2">{text}</Typography>
    </Paper>
  );
}

function Step({ number, text }: { number: number; text: string }) {
  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 1.5,
      }}
    >
      <Box
        sx={{
          width: 48,
          height: 48,
          borderRadius: "50%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          bgcolor: colors.maroon,
          color: colors.yellow,
          border: `2px solid ${colors.brown}`,
          fontSize: "1.5rem",
          fontWeight: "bold",
        }}
      >
        {number}
      </Box>
      <Typography sx={{ maxWidth: 260 }}>{text}</Typography>
    </Box>
  );
}
