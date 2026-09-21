import { defineConfig, devices } from "@playwright/test";

// Requer a api rodando em 127.0.0.1:8000 com dados importados (ver README).
export default defineConfig({
  testDir: "./e2e",
  use: { baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000" },
  projects: [
    { name: "mobile", use: { ...devices["Pixel 7"] } },
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
  ],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : { command: "npm run start", url: "http://localhost:3000", reuseExistingServer: true, timeout: 120_000 },
});
