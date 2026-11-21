/**
 * Throwaway local Postgres for development and tests — no system Postgres
 * install required. Uses the real PostgreSQL server binaries bundled with
 * the `embedded-postgres` npm package, driven directly (initdb / pg_ctl),
 * and serves over TCP so the app's `pg` driver talks to it exactly as it
 * will talk to Neon: same wire protocol, same SQL semantics, real
 * multi-connection transactions.
 *
 * Library use:  import { startPg, stopPg } from "./pg-server" (tests)
 * CLI use:      npx tsx scripts/pg-server.ts start [database]
 *               npx tsx scripts/pg-server.ts url   [database]
 *               npx tsx scripts/pg-server.ts stop
 *
 * Env: SWIM_PG_PORT (default 55432), SWIM_PG_DATA (default <tmpdir>/swim-pg-data).
 *
 * Root note: Postgres refuses to run as root. When this script runs as root
 * (some sandboxes/CI), the server is run as the `postgres` OS user via sudo,
 * and the binaries are copied once to a world-readable temp dir because that
 * user may not be able to read the repo directory. Non-root runs skip all of
 * that and use the package binaries in place.
 */
import { execFile } from "child_process";
import { createRequire } from "module";
import fs from "fs";
import os from "os";
import path from "path";
import { promisify } from "util";
import { Client } from "pg";

const run = promisify(execFile);
const PORT = Number(process.env.SWIM_PG_PORT || 55432);
const DATA_DIR = process.env.SWIM_PG_DATA || path.join(os.tmpdir(), "swim-pg-data");
const BIN_CACHE = path.join(os.tmpdir(), "swim-pg-native");
const DB_USER = "swim";
const isRoot = typeof process.getuid === "function" && process.getuid() === 0;

async function nativeBin(): Promise<string> {
  // Resolve from the repo root (works under tsx and under vitest, whose
  // transformed module URLs break createRequire(import.meta.url)).
  const req = createRequire(path.join(process.cwd(), "package.json"));
  let pkgDir: string;
  try {
    pkgDir = path.dirname(req.resolve("@embedded-postgres/linux-x64/package.json"));
  } catch {
    try {
      // Fall back to the main entry (dist/) and walk up to the package root.
      pkgDir = path.dirname(path.dirname(req.resolve("@embedded-postgres/linux-x64")));
    } catch {
      throw new Error("scripts/pg-server.ts currently supports linux-x64 only (the platform embedded-postgres ships here); point DATABASE_URL at any other Postgres instead");
    }
  }
  const src = path.join(pkgDir, "native");
  if (!isRoot) return path.join(src, "bin");
  const dest = path.join(BIN_CACHE, "native");
  if (!fs.existsSync(path.join(dest, "bin", "postgres"))) {
    fs.rmSync(BIN_CACHE, { recursive: true, force: true });
    fs.mkdirSync(BIN_CACHE, { recursive: true });
    // cp -rL (dereference): the package's lib symlinks must not point back
    // into node_modules — the postgres OS user cannot read the repo tree.
    // (fs.cpSync rewrites them as absolute symlinks on this Node version.)
    await run("cp", ["-rL", src, dest]);
    await run("chmod", ["-R", "a+rX", BIN_CACHE]);
  }
  return path.join(dest, "bin");
}

/** Run a server binary as the postgres OS user when root, else directly. */
async function pgExec(bin: string, args: string[]): Promise<void> {
  if (isRoot) {
    await run("sh", ["-c", "id postgres >/dev/null 2>&1 || useradd -m postgres"]).catch(() => {});
    await run("sudo", ["-u", "postgres", bin, ...args]);
  } else {
    await run(bin, args);
  }
}

/** Readiness probe via the driver (the bundled binaries ship no pg_isready). */
async function isReady(): Promise<boolean> {
  const c = new Client({ connectionString: pgUrl("postgres"), connectionTimeoutMillis: 1000 });
  try {
    await c.connect();
    await c.end();
    return true;
  } catch {
    await c.end().catch(() => {});
    return false;
  }
}

async function waitReady(tries = 30): Promise<boolean> {
  for (let i = 0; i < tries; i++) {
    if (await isReady()) return true;
    await new Promise((r) => setTimeout(r, 250));
  }
  return false;
}

export function pgUrl(database: string): string {
  return `postgres://${DB_USER}@127.0.0.1:${PORT}/${database}`;
}

async function ensureDatabase(database: string): Promise<void> {
  const c = new Client({ connectionString: pgUrl("postgres") });
  await c.connect();
  try {
    const r = await c.query("SELECT 1 FROM pg_database WHERE datname = $1", [database]);
    if (!r.rowCount) await c.query(`CREATE DATABASE "${database.replace(/"/g, '""')}"`);
  } finally {
    await c.end();
  }
}

/** Start the throwaway server (idempotent) and make sure `database` exists. */
export async function startPg(database = "swim_dev"): Promise<{ url: string; port: number }> {
  const bin = await nativeBin();
  if (!(await isReady())) {
    if (!fs.existsSync(path.join(DATA_DIR, "PG_VERSION"))) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
      if (isRoot) await run("chown", ["-R", "postgres:postgres", DATA_DIR]);
      await pgExec(path.join(bin, "initdb"), ["-D", DATA_DIR, "-U", DB_USER, "--auth=trust", "--encoding=UTF8", "--lc-messages=C"]);
    }
    // pg_ctl errors when a server is already running/booting (e.g. a second
    // test worker starting it concurrently) — poll for readiness instead of
    // treating that as fatal.
    await pgExec(path.join(bin, "pg_ctl"), [
      "-D", DATA_DIR,
      "-l", path.join(DATA_DIR, "server.log"),
      "-o", `-p ${PORT} -k ${os.tmpdir()} -h 127.0.0.1`,
      "-w", "start",
    ]).catch(() => {});
    if (!(await waitReady())) throw new Error(`Postgres did not become ready on port ${PORT}; see ${path.join(DATA_DIR, "server.log")}`);
  }
  await ensureDatabase(database);
  return { url: pgUrl(database), port: PORT };
}

export async function stopPg(): Promise<void> {
  const bin = await nativeBin();
  if (await isReady()) {
    await pgExec(path.join(bin, "pg_ctl"), ["-D", DATA_DIR, "-w", "stop"]).catch(() => {});
  }
}

async function cli() {
  const [cmd, database = "swim_dev"] = process.argv.slice(2);
  if (cmd === "start") {
    const { url } = await startPg(database);
    console.log(`Postgres running on port ${PORT}. DATABASE_URL=${url}`);
  } else if (cmd === "url") {
    await startPg(database);
    console.log(pgUrl(database));
  } else if (cmd === "stop") {
    await stopPg();
    console.log("Postgres stopped.");
  } else {
    console.error("Usage: pg-server.ts start|url|stop [database]");
    process.exit(1);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  cli().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
