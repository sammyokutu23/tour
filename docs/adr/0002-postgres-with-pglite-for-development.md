# ADR 0002 — PostgreSQL everywhere; PGlite for local development and tests

**Status:** accepted · 2026-10-21

**Context.** The brief recommends Supabase/Postgres. The build machine had no Docker, Postgres or Supabase CLI. Booking integrity relies on Postgres features (exclusion constraints with `btree_gist`, `tstzrange`, triggers, RLS).

**Decision.** Write plain SQL migrations for Postgres. A small `Db` interface has two drivers: `pg` (when `DATABASE_URL` is set — Supabase in production) and **PGlite** (Postgres compiled to WASM) for development, integration tests and e2e. Use no ORM; parameterised SQL with typed rows keeps constraints and queries explicit.

**Consequences.** Zero-install local setup and real-Postgres integration tests (constraints, triggers and RLS are exercised). PGlite serialises transactions, so true parallel-connection behaviour must also be verified against real Postgres before launch. Only one process can open the embedded database at a time.
