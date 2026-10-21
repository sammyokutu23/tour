# Known limitations & launch checklist

## Verified in this environment

- `npm run typecheck`: passes (strict).
- `npm run lint`: passes.
- `npm test`: 106 tests pass (8 files), including 10 Travel Together unit tests and 20 Travel Together integration tests.
  - Unit: pricing, commission, scheduling, availability, cancellation, state machines, ranking, authorization.
  - Integration on real Postgres (PGlite): full booking lifecycle, idempotency, forged and duplicate callbacks, failed-then-successful payments, decline and expiry releasing inventory, quote drift, policy refunds with ledger reversal, provider partial cancellation, change requests, review eligibility, authorization projections, concurrent guide and slot booking, accounts and rate limits, password reset, provider onboarding, notifications retry, append-only tables, RLS on every table.
  - Component tests.
- `npm run build`: production build succeeds.
- `npm run test:e2e`: 22 Playwright tests pass against a production build: 12 marketplace journeys (all 14 required scenarios), the every-page smoke crawl for all roles, and 9 Travel Together journeys.
- `npm audit --omit=dev`: 0 vulnerabilities.

## Known limitations

- **No real payments yet.** The M-Pesa adapter has not been run against Daraja (no credentials). There is no card adapter. Refunds via M-Pesa are manual.
- **No hosted database or storage tested.** Everything ran on PGlite and local disk. The `pg` driver and Supabase Storage adapter compile but have not been exercised against live services.
- **Concurrency testing is limited.** PGlite serialises transactions, so concurrency tests prove the logic and DB constraints but not parallel connection behaviour. Repeat the concurrency tests against real Postgres.
- **Auth** is first-party (no Supabase Auth, OAuth, email verification or MFA yet). Admin MFA is strongly recommended before launch.
- **Single currency (KES).** No FX conversion; mixing currencies is rejected rather than converted.
- **Travel times** are straight-line estimates (clearly labelled). No routing provider integration yet; map tiles come from OpenStreetMap unless `NEXT_PUBLIC_MAPBOX_TOKEN` is set (OSM tiles are not suitable for production traffic).
- **Itinerary changes after booking** are request/response only. Applying changes means cancelling and rebooking affected items; there is no in-place amendment with repricing.
- **Traveller counts** apply to the whole trip, not per item.
- **Travel Together:**
  - The adult check is self-attested only. There is no identity or background verification.
  - There is no cost splitting or shared wallet: each member pays for their own booking.
  - Chat is refresh-based rather than realtime.
  - Group covers are stored in local storage in development.
  - Retention of group messages and reports is a proposed policy only (see `travel-together.md`).
- **Email only:** no SMS/WhatsApp. No scheduled pre-trip reminders yet (the job runner is the place to add them).
- **Account deletion** is handled by support, not self-service.
- **No error monitoring** (Sentry) or full CSP header yet.
- **Imagery:** destinations use original illustrations. Licensed photography can be added via `destination_media` / `experience_media` (no upload UI yet).
- **Legal pages** are drafts and must be reviewed by counsel.
- **AI companion** is not implemented (Phase 6; architecture notes in `architecture.md`).

## Launch checklist

- [ ] Kenyan counsel review: terms, privacy, cancellation policy, licensing model, payments/escrow question (see `compliance.md`).
- [ ] ODPC registration; DPIA for identity-document processing; retention schedule.
- [ ] Daraja sandbox end-to-end run, then go-live; callback IP allowlist; finance refund and payout runbook.
- [ ] Supabase production project with PITR; run `db:migrate`; storage bucket private; restore drill completed and timed.
- [ ] Secrets set (`FILE_SIGNING_SECRET`, `CRON_SECRET`, Resend, M-Pesa); `PAYMENTS_SANDBOX_ENABLED` unset in production.
- [ ] First admin created; admin accounts use strong unique passwords (+ MFA once added).
- [ ] Sentry (or equivalent) and uptime monitoring on `/api/health`; alerts for failed deliveries, refunds needing action, invalid-signature callbacks.
- [ ] Content-Security-Policy header; load test booking and search endpoints against real Postgres.
- [ ] Re-run the concurrency integration tests against real Postgres.
- [ ] Accessibility audit (axe + keyboard + screen reader) on Studio, checkout and dashboards.
- [ ] Remove demo data from production (it is never seeded there by default); onboard and verify real providers.
- [ ] Counsel review of Travel Together: adult self-attestation, community guidelines, moderation duty, retention schedule for group chat and reports.
- [ ] Staff the Travel Together report queue (urgent reports need an on-call response time) and write a moderation runbook.
- [ ] Mapbox (or Google Maps) key and routing integration, or keep the clearly labelled estimates.
