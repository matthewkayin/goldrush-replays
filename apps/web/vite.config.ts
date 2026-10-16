import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// API_PORT and WEB_PORT let a second checkout (e.g. a git worktree) run
// alongside the main one. The proxy targets 127.0.0.1 because the API binds
// only that address, and "localhost" can resolve to ::1 first.
const apiPort = Number(process.env.API_PORT ?? 3000);
const webPort = Number(process.env.WEB_PORT ?? 5173);

export default defineConfig({
  plugins: [react()],
  server: {
    port: webPort,
    strictPort: true,
    proxy: {
      "/api": {
        target: `http://127.0.0.1:${apiPort}`,
        changeOrigin: true,
      },
    },
  },
});
