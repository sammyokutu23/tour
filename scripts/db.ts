/**
 * Database CLI.
 *   npm run db:migrate   apply pending migrations
 *   npm run db:seed      load development seed data (refuses to run in production)
 *   npm run db:reset     delete the local embedded database and re-create it (PGlite only)
 *   npm run jobs         run background jobs once (expiry, reconciliation, notifications)
 *
 * Uses DATABASE_URL when set, otherwise the embedded PGlite database at PGLITE_DATA_DIR.
 * Stop `npm run dev` first when using PGlite: only one process can open it at a time.
 */
import { rm } from "node:fs/promises";
import { createPgDb, createPgliteDb, migrate, type Db } from "../src/server/db/client";
import { seed } from "../src/server/db/seed";
import { runJobs } from "../src/server/jobs";

async function open(): Promise<Db> {
  return process.env.DATABASE_URL ? createPgDb(process.env.DATABASE_URL) : createPgliteDb(process.env.PGLITE_DATA_DIR ?? ".data/pglite");
}

async function main() {
  const cmd = process.argv[2];
  if (cmd === "reset") {
    if (process.env.DATABASE_URL) throw new Error("db:reset only works with the embedded development database.");
    await rm(process.env.PGLITE_DATA_DIR ?? ".data/pglite", { recursive: true, force: true });
    console.log("Removed local database.");
  }

  const db = await open();
  try {
    if (cmd === "migrate" || cmd === "reset" || cmd === "seed") {
      const ran = await migrate(db);
      console.log(ran.length ? `Applied migrations: ${ran.join(", ")}` : "Database is up to date.");
    }
    if (cmd === "seed" || cmd === "reset") {
      if (process.env.NODE_ENV === "production" && process.env.ALLOW_DEMO_SEED !== "true") {
        throw new Error("Refusing to seed demo data in production. Set ALLOW_DEMO_SEED=true for a staging environment.");
      }
      const password = process.env.SEED_PASSWORD ?? "demo-password-123";
      await seed(db, { password });
      console.log("Seeded development data. Accounts (development only):");
      console.log(`  admin@demo.test / support@demo.test / traveller@demo.test, guide.*@demo.test, operator.*@demo.test — password: ${password}`);
    }
    if (cmd === "jobs") {
      console.log(await runJobs(db));
    }
    if (!["migrate", "seed", "reset", "jobs"].includes(cmd ?? "")) {
      console.error("Usage: tsx scripts/db.ts <migrate|seed|reset|jobs>");
      process.exitCode = 1;
    }
  } finally {
    await db.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
