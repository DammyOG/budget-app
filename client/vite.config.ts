import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: true,
    allowedHosts: [
      // Any device on the Tailscale tailnet (MagicDNS hostnames like
      // dami-linux.tailf16233.ts.net). Access by IP works regardless.
      ".tailf16233.ts.net",
    ],
    proxy: {
      "/api": {
        target: "http://localhost:4000",
        changeOrigin: true,
      },
    },
  },
});
