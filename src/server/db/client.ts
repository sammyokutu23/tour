import { mkdir, readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";

export interface QueryResult<T> {
  rows: T[];
  rowCount: number;
}

/** Anything that can run a parameterised query: the pool itself or a transaction. */
export interface Queryable {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<QueryResult<T>>;
  /** Runs one or more statements without parameters (used for migrations). */
  exec(sql: string): Promise<void>;
}

export interface Db extends Queryable {
  transaction<T>(fn: (tx: Queryable) => Promise<T>): Promise<T>;
  close(): Promise<void>;
  readonly driver: "pglite" | "pg";
}

// Postgres type OIDs we parse explicitly so both drivers return identical shapes.
const INT8 = 20;
const NUMERIC = 1700;
const DATE = 1082;
const TIME = 1083;

function parseInt8(value: string): number {
  const n = Number(value);
  if (!Number.isSafeInteger(n)) throw new Error(`int8 value ${value} exceeds safe integer range`);
  return n;
}

export async function createPgliteDb(dataDir: string): Promise<Db> {
  const { PGlite } = await import("@electric-sql/pglite");
  const { btree_gist } = await import("@electric-sql/pglite/contrib/btree_gist");
  if (!dataDir.startsWith("memory://")) await mkdir(dataDir, { recursive: true });
  const pg = new PGlite(dataDir, {
    extensions: { btree_gist },
    parsers: {
      [INT8]: parseInt8,
      [NUMERIC]: (v: string) => Number(v),
      [DATE]: (v: string) => v,
      [TIME]: (v: string) => v.slice(0, 5),
    },
  });
  await pg.waitReady;

  const wrap = (q: Pick<typeof pg, "query" | "exec">): Queryable => ({
    async query<T>(sql: string, params: unknown[] = []) {
      const res = await q.query<T>(sql, params);
      return { rows: res.rows, rowCount: res.affectedRows || res.rows.length };
    },
    async exec(sql: string) {
      await q.exec(sql);
    },
  });

  return {
    driver: "pglite",
    ...wrap(pg),
    transaction: (fn) => pg.transaction((tx) => fn(wrap(tx))),
    close: () => pg.close(),
  };
}

export async function createPgDb(connectionString: string): Promise<Db> {
  const { default: pgModule } = await import("pg");
  pgModule.types.setTypeParser(INT8, parseInt8);
  pgModule.types.setTypeParser(NUMERIC, (v: string) => Number(v));
  pgModule.types.setTypeParser(DATE, (v: string) => v);
  pgModule.types.setTypeParser(TIME, (v: string) => v.slice(0, 5));

  const pool = new pgModule.Pool({
    connectionString,
    max: Number(process.env.DATABASE_POOL_MAX ?? 10),
    ssl: process.env.DATABASE_SSL === "false" ? undefined : { rejectUnauthorized: process.env.DATABASE_SSL_STRICT !== "false" },
  });

  const run = async <T>(client: { query: typeof pool.query }, sql: string, params: unknown[] = []) => {
    const res = await client.query(sql, params);
    return { rows: res.rows as T[], rowCount: res.rowCount ?? 0 };
  };

  return {
    driver: "pg",
    query: (sql, params) => run(pool, sql, params),
    exec: async (sql) => {
      await pool.query(sql);
    },
    async transaction(fn) {
      const client = await pool.connect();
      try {
        await client.query("begin");
        const result = await fn({
          query: (sql, params) => run(client as never, sql, params),
          exec: async (sql) => {
            await client.query(sql);
          },
        });
        await client.query("commit");
        return result;
      } catch (err) {
        await client.query("rollback").catch(() => undefined);
        throw err;
      } finally {
        client.release();
      }
    },
    close: () => pool.end(),
  };
}

export const MIGRATIONS_DIR = path.join(process.cwd(), "db", "migrations");

/** Applies pending SQL migrations in filename order. Each migration runs in its own transaction. */
export async function migrate(db: Db, dir = MIGRATIONS_DIR): Promise<string[]> {
  await db.query(`create table if not exists schema_migrations (
    name text primary key,
    checksum text not null,
    applied_at timestamptz not null default now()
  )`);
  await db.query("alter table schema_migrations enable row level security");

  // Migrations are applied by `npm run db:migrate` (or automatically in development), so the bundler
  // must not trace the migrations folder — or the whole project — into the server output.
  const files = (await readdir(/*turbopackIgnore: true*/ dir)).filter((f) => f.endsWith(".sql")).sort();
  const applied = new Map(
    (await db.query<{ name: string; checksum: string }>("select name, checksum from schema_migrations")).rows.map(
      (r) => [r.name, r.checksum],
    ),
  );

  const ran: string[] = [];
  for (const file of files) {
    const sql = await readFile(/*turbopackIgnore: true*/ path.join(/*turbopackIgnore: true*/ dir, file), "utf8");
    const checksum = createHash("sha256").update(sql).digest("hex");
    const prior = applied.get(file);
    if (prior) {
      if (prior !== checksum) throw new Error(`Migration ${file} was modified after being applied. Add a new migration instead.`);
      continue;
    }
    await db.transaction(async (tx) => {
      await tx.exec(sql);
      await tx.query("insert into schema_migrations (name, checksum) values ($1, $2)", [file, checksum]);
    });
    ran.push(file);
  }
  return ran;
}
