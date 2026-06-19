import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  root: "web",
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:8787",
        // 解决 multipart 上传 ECONNRESET：不限制代理超时
        timeout: 120000,
        proxyTimeout: 120000,
        proxyFetchUnits: { decompress: false },
      },
    },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
});
