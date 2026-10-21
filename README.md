# Beyond the Destination

**Your journey. Your guide. Your Kenya.** (working brand, configurable via `NEXT_PUBLIC_BRAND_*`)

A Kenya-first travel marketplace where travellers choose their own guides, plan their visit day by day in **Journey Studio**, and book through a server-controlled booking and payment engine. It includes traveller, provider (guide/operator) and admin dashboards, and **Travel Together**: small traveller groups that plan a shared itinerary, vote on ideas and each book through the same engine.

> Listings, providers, prices and schedules in the seed data are **fictional demo data**, flagged `is_demo` and labelled “Demo” in the UI. No reviews or ratings are seeded, and no demo provider is marked verified. Payments in development use a clearly labelled **sandbox** provider; no real money moves.

## Quick start

Requirements: Node.js ≥ 22 (developed on Node 24). No Docker or Postgres install needed for development.

```bash
npm install
npm run db:reset      # creates the embedded dev database (PGlite) and loads seed data
npm run dev           # http://localhost:3000
```

`db:reset` prints the development accounts (`admin@demo.test`, `support@demo.test`, `traveller@demo.test`, `guide.*@demo.test`, `operator.*@demo.test`). The password is `SEED_PASSWORD` or the development default printed by the script. **These accounts exist only in local seed data.**

> The embedded database can be opened by only one process at a time. Stop `npm run dev` before running `npm run db:*` or `npm run jobs`.
>
> Run only **one** `next dev` per project folder. Two dev servers watch each other's build output and put every open page into an endless reload loop.

Useful local pages:

- `/dev/mailbox`: emails captured by the development email adapter (password resets, notifications).
- `/checkout/sandbox/…`: the sandbox “hosted payment page”, reached from a booking’s *Continue to payment*.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Next.js dev server (Turbopack) |
| `npm run build` / `npm start` | Production build / server |
| `npm run typecheck` | `tsc --noEmit` (strict) |
| `npm run lint` | ESLint (Next core-web-vitals + TS) |
| `npm test` | Vitest: unit, integration (real Postgres via PGlite) and component tests |
| `npm run test:e2e` | Playwright: production build + fresh seeded DB on port 3100. Includes the booking journeys and a smoke crawl of every page type as visitor, traveller, guide, operator and admin (fails on console errors, exceptions, HTTP errors or error screens) |
| `npm run db:migrate` / `db:seed` / `db:reset` | Migrations and seed data (`DATABASE_URL` or PGlite) |
| `npm run jobs` | Runs background jobs once (expiry, payment reconciliation, completion, email delivery, travel-group housekeeping) |
| `npm run check` | typecheck + lint + unit/integration tests |

## Tech stack

Next.js 16 (App Router, Cache Components, Server Actions) · React 19 · TypeScript (strict) · Tailwind CSS 4 · Zod · PostgreSQL (Supabase in production, PGlite locally) · Leaflet maps · Vitest + Testing Library · Playwright. Typography: Mona Sans.

## Documentation

- [Architecture](docs/architecture.md): modules, request flow, caching, background jobs
- [Database](docs/database.md): schema, constraints, money and time conventions
- [Security & permissions](docs/security.md): roles, authorization model, data protection
- [Travel Together](docs/travel-together.md): groups, matching, membership, voting, chat and moderation
- [Payments](docs/payments.md): adapter design, sandbox, M-Pesa Daraja setup, ledger, refunds
- [Deployment](docs/deployment.md): environments, configuration, backups and recovery
- [Compliance research](docs/compliance.md): Kenyan licensing and privacy notes (to verify with counsel)
- [Known limitations & launch checklist](docs/launch-checklist.md)
- [Architecture decision records](docs/adr/)

## Project layout

```
db/migrations/          Version-controlled SQL migrations
db/seed-data.ts         Development seed content (real destinations, fictional providers)
src/domain/             Pure business rules: pricing, commission, scheduling, availability,
                        cancellation, state machines, ranking, authorization policies
src/server/             Server-only code: db client, auth, services, payment adapters, storage, jobs
src/app/                Routes (public, studio, dashboard, provider, admin, api) and server actions
src/components/         UI system and feature components
tests/                  unit / integration / components / e2e
```
