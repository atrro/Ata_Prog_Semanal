import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/e2e",
  testIgnore: "**/*.public.spec.ts",
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  use: { baseURL: process.env.E2E_URL ?? "http://localhost:3000", trace: "retain-on-failure" },
  projects: [{ name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 1100 } } }, { name: "mobile", use: { ...devices["iPhone 13"], defaultBrowserType: "chromium" } }],
  webServer: process.env.E2E_URL ? undefined : { command: "npm run dev", url: "http://localhost:3000", reuseExistingServer: !process.env.CI }
});