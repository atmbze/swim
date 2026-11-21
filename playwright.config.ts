import { defineConfig, devices } from "@playwright/test";
// E2E runs against the throwaway local Postgres (scripts/pg-server.ts) with a
// dedicated swim_e2e database: start it, migrate, seed, then serve the app.
const DATABASE_URL = "postgres://swim@127.0.0.1:55432/swim_e2e";
const env = `DATABASE_URL=${DATABASE_URL} UPLOAD_DIR=./data/e2e-uploads INSECURE_COOKIES=1`;
export default defineConfig({
  testDir: "tests/e2e",
  workers: 1,
  use: { baseURL: "http://localhost:3100", ...devices["Pixel 7"] },
  webServer: { command: `npx tsx scripts/pg-server.ts start swim_e2e && ${env} npx tsx scripts/migrate.ts && ${env} SEED_PASSWORD=password123 npx tsx scripts/seed.ts && ${env} npx next start -p 3100`, url: "http://localhost:3100/offline", timeout: 120_000, reuseExistingServer: false },
});
