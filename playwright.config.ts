import { defineConfig, devices } from "@playwright/test";
const env = "DATABASE_PATH=./data/e2e.db UPLOAD_DIR=./data/e2e-uploads INSECURE_COOKIES=1 LOGIN_RATE_LIMIT=100 REGISTER_RATE_LIMIT=100";
export default defineConfig({
  testDir: "tests/e2e",
  workers: 1,
  use: { baseURL: "http://localhost:3100", ...devices["Pixel 7"] },
  webServer: { command: `rm -f data/e2e.db* && ${env} npx tsx scripts/seed.ts && ${env} npx next start -p 3100`, url: "http://localhost:3100/offline", timeout: 120_000, reuseExistingServer: false },
});
