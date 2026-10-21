# Architecture

A **modular monolith** in Next.js. Business rules live in pure modules, services own all database access and authorization, and routes stay thin.

```
Browser ──▶ Server Components (read) ──▶ services ──▶ Postgres
        ──▶ Server Actions (write)  ──▶ services ──▶ Postgres
Payment provider ──▶ /api/payments/[provider]/callback ──▶ bookings.handlePaymentWebhook
Scheduler (Vercel Cron) ──▶ /api/cron/jobs ──▶ jobs.runJobs
```

## Layers

| Layer | Path | Rules |
|---|---|---|
| Domain | `src/domain` | Pure TypeScript, no I/O. Pricing, commission split, cancellation/refund maths, schedule validation, availability windows, state machines, guide ranking, authorization policies. Exhaustively unit-tested. |
| Services | `src/server/services` | Every database read/write. Each function takes `(db, actor, input)`, validates input with Zod, checks authorization close to the data, and throws typed errors (`UserError`, `NotFoundError`, `ForbiddenError`, `ConflictError`). Non-owners get *not found*, so IDs can't be probed. |
| Adapters | `src/server/payments`, `services/email.ts`, `storage.ts`, `components/map` | Swappable integrations behind small interfaces, each with a development implementation. |
| Routes | `src/app` | Server Components for reads, Server Actions (`src/app/actions`) for writes. Actions re-read the session; nothing trusts client-supplied prices, roles or payment status. |

## Key flows

**Journey Studio.** Trip → days → items (`experience` slot, `guide` service time, `note`). Every render re-validates the plan on the server (`validateTripGraph`): overlaps, travel buffers (labelled estimates), minimum notice, slot capacity, guide calendars, trip dates. Prices come from `priceQuote` over catalogue data loaded on the server.

**Quote → booking.** `quoteTrip` stores an immutable `itinerary_versions` snapshot with a short validity. `requestBooking` runs in one transaction. It re-validates and re-prices the plan and rejects any drift from the quote. It snapshots terms and commission into `booking_items`, reserves slot capacity with an atomic conditional `UPDATE`, and places guide holds protected by a Postgres **exclusion constraint**. Repeating a request with the same idempotency key returns the original booking.

**Provider acceptance → payment → confirmation.** Every provider must accept, after which holds are extended through the payment window. Checkout creates a `payment_attempt` (idempotent) and calls the provider outside the DB transaction. Callbacks are stored, deduplicated and re-verified with the provider before `applyVerifiedPayment` confirms the booking and posts a balanced ledger transaction.

**Cancellation and refunds.**
- Travellers get a policy-based refund.
- Providers can cancel only their own items, and the traveller gets a full refund for them.
- The platform can cancel the whole booking with a full refund.

Refunds go through the payment adapter. M-Pesa reversals are manual, so finance marks them complete with a reference.

**Lifecycle jobs** (`src/server/jobs.ts`, idempotent): reconcile pending payments, expire holds, move bookings to `in_progress` and `completed`, and deliver emails with retries and backoff.

## Rendering & caching (Next 16 Cache Components)

- Static page shells prerender; anything that reads the session or database streams in behind `<Suspense>` with skeletons.
- Request-time code first awaits `connection()` (via `requestDb()` or `getSession()`), so nothing touches the database during the build or during prefetch prerenders.
- Slow-changing catalogue data (destinations, categories, regions) is cached with `'use cache'` + `cacheLife('minutes')` and tagged `catalogue`. Admin and provider writes call `updateTag`.
- Availability, slots, prices on detail pages and personalised data are never cached.

## Background work

`/api/cron/jobs` (bearer `CRON_SECRET`; `vercel.json` schedules it every 10 minutes) or `npm run jobs`. Notifications are written in the same transaction as the event (outbox pattern) with a unique `dedupe_key`, and delivered later.

## AI travel companion (future, Phase 6)

Not implemented. The design leaves room for it:
- Suggestions would call the same services as the UI (`studioCatalogue`, `validateTripGraph`, `priceQuote`), so availability, prices and credentials always come from trusted data.
- AI output would be a *proposal* applied through the normal trip mutations, which re-validate on the server.
- Model keys stay server-side.

Journey Studio's current “Matches your interests” panel is deterministic and rule-based.
