import { Pool, types, type PoolClient } from "pg";

// BIGINT (ids, COUNT(*)) comes back from pg as a string by default; the app
// treats ids and counts as JS numbers (safe below 2^53), as it did with SQLite.
types.setTypeParser(20, (v: string) => parseInt(v, 10));
// TIMESTAMPTZ comes back as a Date by default; types.ts declares created_at /
// expires_at as string and the UI renders them directly, so hand back ISO.
types.setTypeParser(1184, (v: string) => new Date(v).toISOString());

/** Anything that can run a query: the pool, or a single client inside a transaction. */
export interface DbExecutor {
  query(sql: string, params?: unknown[]): Promise<{ rows: unknown[]; rowCount: number | null }>;
}

let pool: Pool | null = null;

export function getPool(): Pool {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error("DATABASE_URL is not set — a Postgres connection string is required (see .env.example)");
    }
    pool = new Pool({ connectionString });
    pool.on("error", (e) => console.error("Idle Postgres client error", e));
  }
  return pool;
}

export async function query<T = Record<string, unknown>>(sql: string, params: unknown[] = [], exec: DbExecutor = getPool()): Promise<T[]> {
  const r = await exec.query(sql, params);
  return r.rows as T[];
}

export async function queryOne<T = Record<string, unknown>>(sql: string, params: unknown[] = [], exec: DbExecutor = getPool()): Promise<T | undefined> {
  const rows = await query<T>(sql, params, exec);
  return rows[0];
}

/** Run a write; returns rows touched (replaces better-sqlite3's `.changes`). */
export async function execute(sql: string, params: unknown[] = [], exec: DbExecutor = getPool()): Promise<number> {
  const r = await exec.query(sql, params);
  return r.rowCount ?? 0;
}

/**
 * Run fn on one pooled client inside BEGIN/COMMIT (ROLLBACK on throw).
 * Replaces db.transaction(): every statement inside fn must use the client
 * it is handed, or it silently runs outside the transaction.
 */
export async function withTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const out = await fn(client);
    await client.query("COMMIT");
    return out;
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

/** Test helper: close the pool so the next getPool() builds a fresh one. */
export async function closePool(): Promise<void> {
  if (pool) {
    const p = pool;
    pool = null;
    await p.end();
  }
}

/** True for Postgres unique-violation errors (SQLSTATE 23505). */
export function isUniqueViolation(e: unknown): boolean {
  return typeof e === "object" && e !== null && (e as { code?: string }).code === "23505";
}
