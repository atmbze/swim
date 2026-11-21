import { execute, getPool, query, queryOne } from "@/services/db";
import { migrate } from "@/services/migrations";
import { startPg } from "../scripts/pg-server";

/**
 * The suite runs against a real Postgres — never SQLite. By default it boots
 * the throwaway server from scripts/pg-server.ts (real PostgreSQL binaries
 * via the embedded-postgres package, real wire protocol through `pg`: the
 * same semantics the app gets from Neon). Set TEST_DATABASE_URL to run
 * against any other Postgres instead (it is wiped between tests).
 */
let pgReady: Promise<void> | null = null;
function ensureTestDb(): Promise<void> {
  if (!pgReady) {
    pgReady = (async () => {
      if (process.env.TEST_DATABASE_URL) {
        process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
      } else {
        const { url } = await startPg("swim_test");
        process.env.DATABASE_URL = url;
      }
    })();
  }
  return pgReady;
}

/** Minimal async SQL handle for test-side setup/assertions (replaces db.prepare). */
export interface TestDb {
  get<T = Record<string, unknown>>(sql: string, ...params: unknown[]): Promise<T | undefined>;
  all<T = Record<string, unknown>>(sql: string, ...params: unknown[]): Promise<T[]>;
  run(sql: string, ...params: unknown[]): Promise<number>;
}
const testDb: TestDb = {
  get: (sql, ...params) => queryOne(sql, params),
  all: (sql, ...params) => query(sql, params),
  run: (sql, ...params) => execute(sql, params),
};

/** Fresh schema per test: drop everything, re-run the migration set. */
export async function freshDb(): Promise<TestDb> {
  await ensureTestDb();
  const pool = getPool();
  await pool.query("DROP SCHEMA public CASCADE");
  await pool.query("CREATE SCHEMA public");
  const client = await pool.connect();
  try {
    await migrate(client);
  } finally {
    client.release();
  }
  return testDb;
}

type H = (req: Request, ctx: any) => Promise<Response>; // eslint-disable-line @typescript-eslint/no-explicit-any
export async function call(h: H, opts: { method?: string; url?: string; body?: unknown; form?: FormData; cookie?: string; params?: Record<string, string>; headers?: Record<string, string> } = {}) {
  const headers: Record<string, string> = { ...(opts.headers || {}) };
  if (opts.cookie) headers.cookie = opts.cookie;
  // Give each simulated request its own client IP so route rate limits don't
  // trip across unrelated tests; pass an explicit x-forwarded-for to test limits.
  if (!headers["x-forwarded-for"]) headers["x-forwarded-for"] = `test-${Math.random().toString(36).slice(2)}`;
  let body: BodyInit | undefined;
  if (opts.form) body = opts.form;
  else if (opts.body !== undefined) { body = JSON.stringify(opts.body); headers["content-type"] = "application/json"; }
  const req = new Request(opts.url || "http://localhost/api/x", { method: opts.method || (body ? "POST" : "GET"), headers, body });
  const res = await h(req, { params: Promise.resolve(opts.params || {}) });
  const json = await res.json().catch(() => null);
  return { status: res.status, json, res };
}
export function cookieOf(res: Response) { return (res.headers.get("set-cookie") || "").split(";")[0]; }
