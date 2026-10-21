# Security & permissions

## Roles

| Role | Can |
|---|---|
| traveller | Every account. Plan trips, book, pay, cancel under the applicable policy, message participants, review completed bookings, manage profile, consent and data export. |
| guide / operator | Manage their own provider profile, documents, services, experiences, slots and availability. Accept or decline requests, see **only their own items** in a booking (traveller first name, party size, shared requirements; no email or payments), message, view earnings, reply to reviews. |
| support | Support queue and case handling, plus a minimal booking projection (no amounts, payments or personal notes). Can escalate but can't resolve disputes or take financial actions. |
| admin | Verification, moderation, users and roles, bookings (cancel/complete), payments, refunds, payouts, commission and settings, destinations, audit log. Every privileged action needs a documented reason and is written to `audit_logs`. |

## Authorization model

- **Deny by default.** Policies live in `src/domain/authz.ts` (unit-tested) and run inside every service function on data loaded from the server. Pages, layouts and hidden buttons are never the security boundary.
- **Resource checks.** Trips belong to their owner only (staff don't get blanket access to drafts). Booking access resolves to `traveller | provider | admin | support | none`, and each level gets a different projection. Non-owners receive *not found*.
- **Server Actions re-authenticate** on every call (Next.js also checks the request origin for actions). Prices, commissions and payment states are always computed or verified on the server.

## Authentication

- **Passwords:** scrypt (N=2¹⁵, r=8, p=1, 64-byte key) with a per-user salt and constant-time comparison. Unknown emails go through a dummy hash so timing stays uniform.
- **Sessions:** 32-byte random tokens; only the SHA-256 hash is stored. The cookie is `httpOnly`, `SameSite=Lax`, `Secure` in production, with a `__Host-` prefix and 30-day expiry. Sessions are revoked on logout, password change (other sessions), password reset and suspension.
- **Throttling:** login is limited per email (5 failures per 15 minutes) and per IP (25). Password resets are capped at 3 per email per hour, single-use, expire after 30 minutes, are stored hashed, and give the same response whether or not the account exists.
- **Redirects:** only same-site relative `next` URLs are accepted.

## Data protection

- Provider documents go to private storage: Supabase Storage private bucket, or the local disk outside `public/` in development. Content is validated by magic bytes (PDF/JPEG/PNG/WebP), capped at 8 MB, and hashed. Downloads go through `/documents/[id]`, which checks authorization, audits admin views and redirects to a **two-minute signed link** served with `nosniff` and a sandboxing CSP.
- Payment callbacks: payloads are persisted without phone numbers. Card data never touches the platform.
- Logs and audit entries redact keys matching password, token, secret, card, PIN or passkey. Unexpected errors are logged server-side and users see a generic message with a digest.
- Analytics events are linked to a user only with explicit consent; withdrawing consent unlinks past events.
- Self-service data export is available at `/api/me/export`. Account deletion currently goes through support (see limitations).

## Web hardening

- **Headers:** `X-Content-Type-Options`, `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy`, HSTS. Not yet set: a full Content-Security-Policy (see the launch checklist).
- **Injection:** all SQL is parameterised. Dynamic filters use `SqlParams`, and `LIKE` input is escaped.
- **XSS:** React escaping throughout. JSON-LD is serialised with `<` escaped, and map popups escape labels.
- **Images:** user-supplied images are rendered with plain `<img>` (https only, `no-referrer`), not proxied, so there's no open image optimiser.
- **Secrets:** server-only modules (`import "server-only"`). Only `NEXT_PUBLIC_*` values reach the browser.

## Verified dependencies

`npm audit --omit=dev` reported 0 vulnerabilities at the time of writing (CI runs it on every build).
