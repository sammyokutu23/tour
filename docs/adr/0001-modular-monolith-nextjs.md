# ADR 0001 — Modular monolith on Next.js App Router

**Status:** accepted · 2026-10-21

**Context.** The repository was empty. The product needs public SEO pages, rich authenticated dashboards and a transactional booking engine, built by a small team.

**Decision.** Build a single Next.js 16 app with strict TypeScript. Pure domain rules sit in `src/domain`, data access and authorization in `src/server/services`, and routes stay thin. Writes go through Server Actions; reads go through Server Components. Keep the Cache Components defaults from `create-next-app`.

**Consequences.** There is one deployable and one schema, and domain logic is shared by every surface. Services can be extracted later if scale demands. Cache Components requires discipline: request-time data sits behind `<Suspense>` after `connection()`, which is enforced by `requestDb()` and `getSession()`.
