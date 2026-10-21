import { defineConfig, devices } from "@playwright/test";

/**
 * Runs the e2e suite against an already-running dev server (E2E_BASE_URL, default http://localhost:3000).
 * Run only ONE `next dev` per project folder: two dev servers watch each other's build output and
 * trigger endless full-page reloads.
 */
export default defineConfig({
  testDir: "tests/e2e",
  workers: 1,
  timeout: 180_000,
  expect: { timeout: 30_000 },
  reporter: [["list"]],
  use: { baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000", trace: "retain-on-failure" },
  projects: [{ name: "dev", use: { ...devices["Desktop Chrome"] } }],
});
