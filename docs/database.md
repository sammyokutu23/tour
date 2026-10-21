# Database

PostgreSQL. The schema lives in `db/migrations/*.sql`. Migrations are applied in filename order, each in its own transaction, and recorded in `schema_migrations` with a checksum. Editing an applied migration is refused; add a new one instead.

- **Development and tests:** PGlite (Postgres 18 compiled to WASM), so the same SQL, constraints and extensions (`btree_gist`) run locally without Docker.
- **Production:** `DATABASE_URL` (Supabase Postgres) via `pg`.

## Conventions

- **Money:** `bigint` minor units with an explicit `currency char(3)`. All arithmetic is integer, using basis points for rates. Refunds round down so we never over-refund.
- **Time:** every instant is `timestamptz` (UTC). Destinations and providers store an IANA zone (`Africa/Nairobi`), and local wall-clock conversion happens in `src/lib/time.ts`. Calendar days are `date`.
- **Statuses:** `CHECK` constraints in the DB; transitions are enforced by the state machines in `src/domain/states.ts` and recorded in event tables.
- **Snapshots:** bookings copy titles, times, prices, cancellation policy, inclusions and commission at request time. Catalogue edits never alter existing bookings.

## Entities

| Area | Tables |
|---|---|
| Identity | `users`, `user_roles`, `sessions` (hashed tokens), `password_reset_tokens` (hashed), `auth_attempts` (rate limiting), `traveller_profiles` (preferences and consent) |
| Providers | `provider_profiles` (guide/operator, status machine, `is_demo`), `provider_regions`, `provider_documents` (private storage keys + sha256), `provider_verifications` (type, result, reviewer, notes, expiry) |
| Catalogue | `destinations`, `destination_media`, `experience_categories`, `experiences` (generated `tsvector` for search), `experience_media`, `experience_slots` (capacity/reserved with `CHECK reserved <= capacity`), `guide_services`, `availability_rules`, `availability_exceptions`, `pricing_rules` (group discounts) |
| Platform | `platform_settings`, `commission_rules`, `favourites` |
| Itineraries | `trips`, `trip_members`, `itinerary_days`, `itinerary_items`, `itinerary_versions` (**append-only**), `itinerary_change_requests` |
| Bookings | `bookings` (booking status ≠ payment status), `booking_items` (with `CHECK commission + earnings = line_total`), `booking_status_events` (**append-only**), `inventory_holds` |
| Payments | `payment_attempts` (unique idempotency key and unique `(provider, provider_reference)`), `payment_events` (unique `(provider, provider_event_id)`), `refunds`, `payouts`, `ledger_entries` (**append-only**, double entry), `sandbox_transactions` (dev provider) |
| Communication | `conversations`, `conversation_participants`, `messages`, `notifications` (unique `dedupe_key`), `notification_deliveries`, `email_messages` |
| Trust & ops | `reviews` (unique per booking item), `support_cases` (support/dispute/safety/report), `support_case_events`, `audit_logs` (**append-only**), `analytics_events` |

The brief listed a separate `disputes` table. Disputes are `support_cases.kind = 'dispute'` with priority, assignment and events instead, which avoids a redundant table.

## Integrity guarantees (tested)

- **No double-booked guides:** `EXCLUDE USING gist (guide_provider_id WITH =, during WITH &&) WHERE (kind='guide' AND status IN ('held','confirmed'))`. `during` includes the service's post-booking buffer.
- **No oversold slots:** `UPDATE experience_slots SET reserved = reserved + n WHERE … AND reserved + n <= capacity` inside the booking transaction, backed by a `CHECK` constraint.
- **No duplicate payments or events:** unique constraints on idempotency keys, provider references and event ids.
- **Balanced ledger:** `postLedger` refuses any transaction that doesn't sum to zero. Ledger, audit, status events and itinerary versions reject `UPDATE` and `DELETE` via trigger.
- **Deny-by-default exposure:** Row Level Security is enabled on every table with no policies. The app connects with a privileged server role; if the schema is ever exposed through Supabase’s Data API, the `anon` and `authenticated` roles can read nothing.

## Ledger accounts

`cash` (debit balance), `provider_payable`, `platform_revenue`, `tax_payable`, `suspense` (payments for closed bookings awaiting refund). Debits are positive and credits negative.

- **Payment captured:** `cash +total`, `provider_payable −earnings` (per item), `platform_revenue −(commission + service fee)`, `tax_payable −tax`.
- **Refund:** the proportional reverse.
- **Payout:** `provider_payable +amount`, `cash −amount`.
