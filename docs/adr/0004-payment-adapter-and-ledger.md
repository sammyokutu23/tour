# ADR 0004 — Payment adapter, verified callbacks and a double-entry ledger

**Status:** accepted · 2026-10-21

**Decision.**
- All providers implement `PaymentProvider`. Callbacks are persisted and deduplicated, then **re-verified with the provider** before state changes.
- Booking status and payment status are separate state machines.
- Money movements are recorded in an append-only, balanced double-entry `ledger_entries` table instead of mutable balance columns.
- A labelled sandbox provider with HMAC-signed webhooks exercises the same pipeline in development.

**Consequences.** Adding M-Pesa, card or other providers doesn't touch booking logic. Provider balances, platform revenue and refunds are derived from the ledger and are auditable. Manual operations (M-Pesa reversals, payouts) are recorded with external references rather than editing bookings.
