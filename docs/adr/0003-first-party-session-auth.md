# ADR 0003 — First-party session authentication

**Status:** accepted (revisit before launch) · 2026-10-21

**Context.** Supabase Auth was the suggested default, but no Supabase project or credentials were available, and the app needs role- and resource-level authorization on the server either way.

**Decision.** Implement email/password auth in-app:
- scrypt password hashes
- random session tokens stored as SHA-256 hashes, sent as httpOnly `SameSite=Lax` cookies
- DB-backed throttling
- hashed, single-use reset tokens

Roles live in `user_roles`; authorization happens in services.

**Consequences.** Fully testable offline with no vendor coupling. Missing for now: OAuth, email verification and MFA. The auth surface is isolated (`src/server/auth`, `services/accounts.ts`), so migrating to Supabase Auth or another provider later means replacing session resolution with that provider's identity while keeping `user_roles` and the services unchanged.
