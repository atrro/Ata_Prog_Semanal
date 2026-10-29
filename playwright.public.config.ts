import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: "**/*.public.spec.ts",
  fullyParallel: false,
  workers: 1,
  use: { baseURL: "http://127.0.0.1:3100/Ata_Prog_Semanal/", trace: "retain-on-failure" },
  projects: [
    { name: "public-desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "public-mobile", use: { ...devices["iPhone 13"], defaultBrowserType: "chromium" } }
  ],
  webServer: { command: "node tests/static-server.mjs", url: "http://127.0.0.1:3100/Ata_Prog_Semanal/" }
});