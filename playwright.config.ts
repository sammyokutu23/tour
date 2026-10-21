import { defineConfig, devices } from "@playwright/test";

const PORT = 3100;
const env = {
  PGLITE_DATA_DIR: ".data/e2e",
  ALLOW_EMBEDDED_DB: "true",
  PAYMENTS_SANDBOX_ENABLED: "true",
  SANDBOX_WEBHOOK_SECRET: "e2e-sandbox-secret",
  FILE_SIGNING_SECRET: "e2e-file-secret",
  APP_URL: `http://localhost:${PORT}`,
  SEED_PASSWORD: "demo-password-123",
};

/**
 * End-to-end tests run against a production build with a freshly seeded embedded database
 * (never against production data). The sandbox payment provider is explicitly enabled.
 */
export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: [["list"]],
  use: { baseURL: `http://localhost:${PORT}`, trace: "retain-on-failure", screenshot: "only-on-failure" },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
  ],
  webServer: {
    command: `(rm -rf .data/e2e || (sleep 2 && rm -rf .data/e2e)) && npx tsx scripts/db.ts reset && npx next start -p ${PORT}`,
    url: `http://localhost:${PORT}/api/health`,
    timeout: 120_000,
    reuseExistingServer: false,
    env,
  },
});
