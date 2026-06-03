import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

// Proxy `/api/*` → FastAPI so the frontend can call relative URLs in dev
// without CORS preflight roundtrips. In production builds (`npm run build`),
// set VITE_API_BASE to your absolute backend URL.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const backend = env.VITE_DEV_BACKEND || "http://127.0.0.1:8000";

  return {
    plugins: [react()],
    server: {
      port: 5173,
      strictPort: false,
      proxy: {
        "/api": {
          target: backend,
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api/, ""),
        },
      },
    },
    build: {
      outDir: "dist",
      sourcemap: true,
      target: "es2020",
    },
  };
});
