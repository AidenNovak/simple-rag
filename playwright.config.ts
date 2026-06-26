import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./server/test",
  testMatch: /playwright-.*\.spec\.ts/,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  use: {
    baseURL: "http://localhost:5173",
    headless: true,
    actionTimeout: 15000,
  },
  projects: [
    { name: "chromium", use: { browserName: "chromium" } },
  ],
  webServer: process.env.E2E_NO_AUTOSERVE
    ? undefined
    : {
        command: "npm run web:dev",
        port: 5173,
        reuseExistingServer: true,
        timeout: 30000,
      },
});
