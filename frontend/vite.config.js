import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// Dev server runs on 5174 (NEWFMS uses 5173) and forwards /api to the backend on 5002.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5174,
    strictPort: true,
    proxy: {
      "/api": { target: "http://localhost:5002", changeOrigin: true },
    },
  },
});
