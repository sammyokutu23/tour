# Deployment

The app is a standard Next.js 16 application and deploys to any Node host. Vercel is assumed below (`vercel.json` schedules the job runner).

## Environments

| | Development | Staging | Production |
|---|---|---|---|
| Database | PGlite (`.data/pglite`) | Supabase Postgres | Supabase Postgres (PITR enabled) |
| Payments | Sandbox | Sandbox (`PAYMENTS_SANDBOX_ENABLED=true`) + Daraja sandbox | Daraja production (+ card adapter when added) |
| Email | dev mailbox | Resend (test domain) | Resend |
| Seed data | `npm run db:reset` | `ALLOW_DEMO_SEED=true npm run db:seed` (optional) | **Never** |

## First deployment

1. Create a Supabase project. Copy the **pooled connection string** into `DATABASE_URL`, and create a private Storage bucket (e.g. `provider-documents`).
2. Set the environment variables from `.env.example` in the host. Generate `FILE_SIGNING_SECRET` and `CRON_SECRET` with `openssl rand -hex 32`. Never expose `SUPABASE_SERVICE_ROLE_KEY` as `NEXT_PUBLIC_*`.
3. Run migrations against the target database: `DATABASE_URL=… npm run db:migrate`. Do this as a release step before switching traffic, and keep migrations backward compatible with the running version.
4. Deploy. Check `GET /api/health` → `{ "status": "ok", "database": "pg" }`.
5. Create the first admin: register normally, then grant the role in SQL (`insert into user_roles (user_id, role) values ('<id>', 'admin')`) and record the grant in your change log. After that, grant roles from **Admin → Users**.
6. Confirm the cron job runs (`/api/cron/jobs` returns 401 without the bearer and JSON with it).

## Monitoring

- Add an error monitor (e.g. Sentry for Next.js) through `instrumentation.ts`. It isn't installed yet (see the launch checklist).
- Watch: failed notification deliveries (Admin → Notifications), refunds needing action, payment events with `invalid_signature`, `amount_mismatch` or `unknown_reference`, and open urgent support cases.

## Backups & recovery

- Enable Supabase **Point-in-Time Recovery** for production, plus daily logical backups (`pg_dump --format=custom`) kept in separate storage for at least 30 days.
- Back up the documents Storage bucket (versioning or scheduled copy).
- **Restore drill** (run before launch, then quarterly):
  1. Restore the latest backup into a new project.
  2. Point a staging deployment at it.
  3. Run `npm run db:migrate` (it should report “up to date”).
  4. Verify a sample of bookings, ledger sums (`select txn_id, sum(amount_minor) from ledger_entries group by 1 having sum(amount_minor) <> 0` must return no rows) and document downloads.
  5. Record how long it took.
- The ledger, status events and audit logs are append-only, so restores can be checked for missing data by sequence ids.
