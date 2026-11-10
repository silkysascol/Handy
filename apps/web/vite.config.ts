import { defineConfig } from "vite";

// En desarrollo, la API del mundo la sirve `pnpm --filter @handy/web start` en el puerto 5174.
export default defineConfig({
  server: { port: 5173, proxy: { "/api": "http://127.0.0.1:5174" } },
  build: { outDir: "dist", chunkSizeWarningLimit: 1200 },
});
