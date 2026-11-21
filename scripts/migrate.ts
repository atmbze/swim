/* Runs the Postgres migration set once, as an explicit deploy step.
   Usage: npm run migrate
   Uses DATABASE_URL_UNPOOLED when set (Neon's direct endpoint — migrations
   should not go through the transaction pooler), else DATABASE_URL. */
import { Pool } from "pg";
import { currentSchemaVersion, migrate } from "../src/services/migrations";

async function main() {
  const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
  if (!url) throw new Error("Set DATABASE_URL (or DATABASE_URL_UNPOOLED) first — see .env.example");
  const pool = new Pool({ connectionString: url });
  const client = await pool.connect();
  try {
    await migrate(client);
    console.log(`Migrations up to date. Schema version: ${await currentSchemaVersion(client)}`);
  } finally {
    client.release();
    await pool.end();
  }
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
