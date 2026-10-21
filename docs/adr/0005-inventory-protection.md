# ADR 0005 — Inventory protection with constraints, not application locks

**Status:** accepted · 2026-10-21

**Decision.**
- **Guide time:** `inventory_holds` rows with a `tstzrange` (including the service buffer), guarded by a Postgres **exclusion constraint** over active holds.
- **Group-experience capacity:** an atomic conditional `UPDATE … SET reserved = reserved + n WHERE reserved + n <= capacity`, plus a `CHECK` constraint.
- Holds expire together with their booking (the expiry job and the booking path both release them). Experiences priced per group consume one unit of capacity; per-person ones consume the party size.

**Consequences.** Double booking is impossible even under concurrent requests or application bugs, and the loser receives a clear conflict message. A provider's own experience slots are not cross-checked against the same person's guide calendar; providers keep these consistent (noted as a limitation).
