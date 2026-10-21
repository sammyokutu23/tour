import "server-only";
import { createPgDb, createPgliteDb, migrate, type Db } from "./client";

export type { Db, Queryable } from "./client";

const globalForDb = globalThis as unknown as { __btdDb?: Promise<Db> };

async function open(): Promise<Db> {
  const url = process.env.DATABASE_URL;
  if (url) {
    // Production / hosted Postgres: migrations are applied by `npm run db:migrate` during deploy.
    return createPgDb(url);
  }
  if (process.env.NODE_ENV === "production" && process.env.ALLOW_EMBEDDED_DB !== "true") {
    throw new Error("DATABASE_URL is required in production. Set ALLOW_EMBEDDED_DB=true only for local smoke tests.");
  }
  const db = await createPgliteDb(process.env.PGLITE_DATA_DIR ?? ".data/pglite");
  await migrate(db);
  return db;
}

/** Process-wide database handle. Server-only. */
export function getDb(): Promise<Db> {
  globalForDb.__btdDb ??= open().catch((err) => {
    globalForDb.__btdDb = undefined;
    throw err;
  });
  return globalForDb.__btdDb;
}
