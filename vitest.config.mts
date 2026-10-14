import { defineConfig } from "vitest/config";
import path from "path";
export default defineConfig({
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "src") } },
  test: { include: ["tests/unit/**/*.test.ts", "tests/integration/**/*.test.ts"], env: { DATABASE_PATH: ":memory:", BCRYPT_COST: "4", UPLOAD_DIR: "/tmp/swim-test-uploads" }, fileParallelism: false },
});
