import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: "**/*.company.spec.ts",
  workers: 1,
  use: { baseURL: "http://127.0.0.1:3300", trace: "retain-on-failure" },
  projects: [
    { name: "company-desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "company-mobile", use: { ...devices["iPhone 13"], defaultBrowserType: "chromium" } }
  ],
  webServer: {
    command: "STATIC_EXPORT=false NEXT_PUBLIC_BASE_PATH= NEXT_PUBLIC_ACCESS_MODE=company npm run build -w apps/web && cp -r apps/web/.next/static apps/web/.next/standalone/apps/web/.next/static && node tests/company-server-runner.mjs",
    url: "http://127.0.0.1:3300/healthz",
    timeout: 120000
  }
});
